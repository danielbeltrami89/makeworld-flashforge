/* Minimal ZIP reader/writer for Chrome. Supports stored (0) and deflated (8) entries. */
(() => {
  const td = new TextDecoder();
  const te = new TextEncoder();

  const u16 = (a, o) => a[o] | (a[o+1] << 8);
  const u32 = (a, o) => (a[o] | (a[o+1] << 8) | (a[o+2] << 16) | (a[o+3] << 24)) >>> 0;
  function p16(v){ return new Uint8Array([v&255,(v>>>8)&255]); }
  function p32(v){ return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]); }
  function concat(parts) {
    const n = parts.reduce((s,p)=>s+p.length,0), out = new Uint8Array(n);
    let o=0; for(const p of parts){ out.set(p,o); o+=p.length; } return out;
  }

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
    return t;
  })();
  function crc32(bytes){ let c=0xffffffff; for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xffffffff)>>>0; }

  async function inflateRaw(data) {
    const ds = new DecompressionStream('deflate-raw');
    const ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(ab);
  }
  async function deflateRaw(data) {
    const cs = new CompressionStream('deflate-raw');
    const ab = await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(ab);
  }

  async function read(bytes) {
    // Find EOCD in the last 65,557 bytes.
    let eocd=-1;
    for(let i=bytes.length-22, min=Math.max(0, bytes.length-65557); i>=min; i--){
      if(u32(bytes,i)===0x06054b50){ eocd=i; break; }
    }
    if(eocd<0) throw new Error('ZIP/3MF inválido: EOCD não encontrado.');
    const count=u16(bytes,eocd+10), cdOffset=u32(bytes,eocd+16);
    let p=cdOffset; const entries=[];
    for(let i=0;i<count;i++){
      if(u32(bytes,p)!==0x02014b50) throw new Error('ZIP inválido: central directory corrompido.');
      const method=u16(bytes,p+10), crc=u32(bytes,p+16), csize=u32(bytes,p+20), usize=u32(bytes,p+24);
      const nlen=u16(bytes,p+28), xlen=u16(bytes,p+30), clen=u16(bytes,p+32), local=u32(bytes,p+42);
      const name=td.decode(bytes.slice(p+46,p+46+nlen));
      if(u32(bytes,local)!==0x04034b50) throw new Error('ZIP inválido: local header ausente.');
      const ln=u16(bytes,local+26), lx=u16(bytes,local+28), start=local+30+ln+lx;
      const comp=bytes.slice(start,start+csize);
      let data;
      if(method===0) data=comp;
      else if(method===8) data=await inflateRaw(comp);
      else throw new Error(`ZIP usa método de compressão não suportado: ${method}`);
      entries.push({name,data,method,crc,usize});
      p += 46+nlen+xlen+clen;
    }
    return entries;
  }

  async function write(entries) {
    const locals=[], centrals=[]; let offset=0;
    for(const ent of entries){
      const name=te.encode(ent.name), data=ent.data instanceof Uint8Array?ent.data:new Uint8Array(ent.data);
      const comp=await deflateRaw(data), crc=crc32(data);
      const local=concat([
        p32(0x04034b50),p16(20),p16(0x0800),p16(8),p16(0),p16(0),p32(crc),p32(comp.length),p32(data.length),p16(name.length),p16(0),name,comp
      ]);
      locals.push(local);
      const central=concat([
        p32(0x02014b50),p16(20),p16(20),p16(0x0800),p16(8),p16(0),p16(0),p32(crc),p32(comp.length),p32(data.length),
        p16(name.length),p16(0),p16(0),p16(0),p16(0),p32(0),p32(offset),name
      ]);
      centrals.push(central); offset += local.length;
    }
    const cd=concat(centrals);
    const eocd=concat([p32(0x06054b50),p16(0),p16(0),p16(entries.length),p16(entries.length),p32(cd.length),p32(offset),p16(0)]);
    return concat([...locals,cd,eocd]);
  }

  globalThis.MiniZip = { read, write, text: b=>td.decode(b), bytes: s=>te.encode(s) };
})();
