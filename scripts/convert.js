const fs = require('node:fs/promises');
require('../zip.js');
require('../converter.js');

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || input === output) {
    throw new Error('Usage: node scripts/convert.js input.3mf output.3mf (distinct paths)');
  }
  const { bytes, report } = await FlashForgeConverter.convert3mf(await fs.readFile(input));
  await fs.writeFile(output, bytes, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
