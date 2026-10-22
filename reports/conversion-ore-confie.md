# Investigacao ORE e Confie, 22/10/2026

## Conclusao e limites

Nao houve perda nem deslocamento de geometria na conversao 0.2.8 fornecida. As malhas, componentes, transforms, unidades, build, relacoes e associacoes de cores sao identicos ao original. O defeito reproduzido esta na compatibilidade das configuracoes: dois valores automaticos Bambu sao invalidos no Flash Studio 2.4.2. A heranca dos perfis tambem era inconsistente e os overrides de filamento podiam ser substituidos pelos valores do perfil instalado.

Os dois arquivos fornecidos contem `layer_height=0.08`, `initial_layer_print_height=0.2`, `enable_support=1`, `support_type=tree(auto)`, `support_style=tree_slim` e `wall_generator=arachne`. A captura do Flash Studio mostra 24 camadas, enquanto a do Bambu mostra 60; a primeira inclusive exibe 0.08 no painel de configuracao. Os arquivos nao registram o estado completo daquela sessao. Nao e possivel atribuir com certeza as 24 camadas a uma linha do conversor: esse codigo nao trocou `layer_height` para 0.20. Preview desatualizado ou ajustes diferentes na sessao continuam sendo hipoteses, nao conclusoes.

O aviso de regioes flutuantes nao prova corrupcao do 3MF. O texto do original ja apresenta regioes sobre vazios e o autor ativou suportes. Diferencas entre os motores de fatiamento continuam possiveis, principalmente nas letras finas, mesmo com a geometria preservada.

## Comparacao estrutural anterior a correcao

Entradas: 26 no original e 27 no convertido, com a adicao de `Metadata/flashforge_conversion.json`. Nenhuma entrada removida. Apenas tres entradas tinham bytes diferentes:

- `3D/3dmodel.model`: somente o valor de Application foi alterado, de BambuStudio-02.06.01.55 para BambuStudio-02.04.00.02.
- `Metadata/project_settings.config`: conversao dos perfis e configuracoes.
- `Metadata/slice_info.config`: somente a versao do cliente.

`3D/Objects/object_16.model`, `Metadata/model_settings.config`, todos os `.rels`, imagens, `filament_sequence.json`, `cut_information.xml` e `custom_gcode_per_layer.xml` sao identicos byte a byte. O arquivo nao inclui G-code fatiado nem perfil de altura variavel. A versao corrigida mantem essas mesmas invariantes.

O build instancia o objeto 4. Ele referencia os objetos 1, 2 e 3 de `/3D/Objects/object_16.model`. As duas unidades sao `millimeter`. UUIDs, referencias externas da extensao Production e a ordem das pecas foram preservados. As matrizes adicionais de edicao em `model_settings.config` tambem foram mantidas, sem reaplica-las sobre os vertices.

## Geometria por componente

Coordenadas efetivas em milimetros, depois do transform do componente e do build. Todos os valores abaixo sao iguais no original, no convertido antigo e no novo.

| ID | Componente | Vertices | Triangulos | Dimensoes XYZ | Z minimo/maximo | Extrusor/cor |
| --- | --- | ---: | ---: | --- | --- | --- |
| 1 | ore_0, base | 2668 | 5348 | 45.753160 / 28.500480 / 3.500000 | 0 / 3.5 | 1 / #000000 |
| 2 | text_shape | 1094 | 2172 | 27.205000 / 7.940000 / 1.500000 | 3.45 / 4.95 | 2 / #FFFFFF |
| 3 | Generico-Cilindro_Boolean, ilhos | 2880 | 5760 | 4.583895 / 4.583895 / 2.000000 | aproximadamente 0 / 2 | 1 / #000000 |

Bounding boxes completas:

| ID | Minimo XYZ | Maximo XYZ |
| --- | --- | --- |
| 1 | 105.464079, 107.417477, 0 | 151.217239, 135.917956, 3.5 |
| 2 | 124.736588, 113.356367, 3.45 | 151.941588, 121.296366, 4.95 |
| 3 | 107.003286, 134.258364, -0.000000000265 | 111.587180, 138.842259, 2.000000000265 |

Total: 6642 vertices, 13280 triangulos, dimensoes 46.477509 x 31.424782 x 4.95 mm. O pequeno erro numerico do ilhos ja existe no original e nao foi corrigido com deslocamento arbitrario.

A conectividade por indices de vertices mostra uma casca na base, oito no texto e uma no ilhos, igualmente em ambos os arquivos. As oito partes do texto comecam em Z=3.45. O intervalo de Z do texto sobrepoe o topo da base em 0.05 mm; isso nao significa que exista base sob todo o texto. Seu limite X tambem ultrapassa a base em aproximadamente 0.724 mm.

Uma sondagem dos centroides das 539 faces inferiores do texto encontrou 288 sobre a projecao da base a essa altura e 251 sobre vazios. Trata-se de amostragem de faces, nao de percentual de area ou prova de que cada ilha inteira flutua. Ela confirma que existem balancos/trechos sem base diretamente abaixo no proprio original. A conversao conserva essas condicoes e os suportes solicitados.

## Defeitos e alteracoes

Em `converter.js`, `replaceUnsupportedValue` nao tratava:

| Configuracao | Original | Flash Studio 2.4.2 | Correcao |
| --- | --- | --- | --- |
| tree_support_wall_count | -1 = automatico | aceita 0 a 2; 0 = automatico | -1 para 0 |
| raft_first_layer_expansion | -1 = automatico | aceita valores >= 0, padrao 2 mm | -1 para 2, com aviso de aproximacao |

A CLI recusou o convertido antigo com codigo de saida 238 e os dois nomes de parametros fora de faixa. Nao foi necessario imprimir nem alterar a geometria para reproduzir o problema.

`convertJson` mantinha `inherits_group[0] = 0.16mm High Quality @BBL A1` enquanto renomeava o processo para AD5X. Tambem reconstruia apenas o primeiro slot de `different_settings_to_system`. Agora os slots sao reconstruidos como processo, cada filamento, impressora. Os ajustes retidos do processo e dos filamentos sao explicitados; o ultimo slot permite usar os valores do perfil oficial da impressora. O loader nativo filtra os nomes de configuracao pelo schema da colecao. A compatibilidade do processo passa a apontar explicitamente para AD5X.

G-codes de maquina restantes, como before/after layer e timelapse, deixam de ser overrides Bambu. O perfil instalado fornece os scripts da AD5X. O XML de pausas por camada e os recursos de modelo sao preservados.

Outras protecoes verificadas por regressao:

- `patchModelHeader` substitui somente os bytes do valor Application. Antes, um caractere UTF-8 cortado no limite de 128 KiB podia ser corrompido ao recodificar todo o prefixo. Isso nao aconteceu neste chaveiro.
- O limite de temperatura se aplica apenas as chaves de temperatura do nozzle, sem alterar IDs/indices de filamento ou outras propriedades numericas.
- Metadados JSON aninhados desconhecidos deixam de receber identidades de impressora recursivamente.
- `zip.js` valida CRC, tamanho, limites de entradas e duplicatas, rejeitando arquivos corrompidos em vez de reempacota-los silenciosamente.

Nao houve uniao de malhas, deslocamento Z, rearranjo ou achatamento das cores. O nome do perfil-base 0.20mm nao substitui o ajuste 0.08 do projeto.

## Validacao executada

13 testes automatizados passaram, incluindo o arquivo real local e fixtures sinteticos de geometria, dimensoes, materiais core, pintura por face, cores por parte, transformacoes aninhadas, rotacao/escala/translacao, multiplos objetos/build items, unidades, metadados desconhecidos, UTF-8, integridade ZIP e idempotencia.

O modelo real declara `MakerWorld Exclusive License`. Seus bytes e imagens nao foram incorporados aos testes do repositorio; o teste real e opcional via `ORIGINAL_3MF` e as fixtures permanentes sao sinteticas.

Foi executado o fatiador real instalado, via CLI, com orientacao e arranjo desativados. A CLI do Flash Studio tentou buscar perfis em `profiles/BBL/machine_full` mesmo para a AD5X. Por isso o teste carregou explicitamente o JSON oficial da AD5X com a heranca resolvida a partir da instalacao local. Isso nao e uma modificacao de malha nem uma sobreposicao do perfil de processo original.

| Medida observada | Bambu Studio 02.08.02.61, original | Flash Studio 2.4.2, novo convertido |
| --- | --- | --- |
| Camada / primeira camada | 0.08 / 0.20 mm | 0.08 / 0.20 mm |
| Camadas | 60 | 60 |
| Gerador de paredes | arachne | arachne |
| Suportes realmente gerados | sim | sim |
| Preto, indices de camadas (base zero) | 0 a 41 | 0 a 41 |
| Branco, indices de camadas (base zero) | 42 a 59 | 42 a 59 |
| Peso estimado total | 4.52 g | 4.24 g |
| Tempo estimado | 40min18s | 38min13s |

As diferencas de estimativa nao sao usadas como prova de fidelidade: a prova geometrica vem da igualdade de recursos e transforms, complementada pelo fatiamento com as mesmas alturas e sequencia de cores. Os motores, suportes automaticos e perfis de maquina sao distintos.

A CLI retornou sucesso e gerou G-code e 3MF fatiado. Permaneceram avisos de busca de presets, diferenca entre dimensoes de mesa antiga e nova, uma limitacao do SupportSpotsGenerator para multiplos materiais e um aviso de temperatura de mesa em `slice_info.config`. Nao afirmamos ausencia de todos os avisos. A interface grafica nao foi validada: a tentativa de acesso expirou. Nenhum arquivo foi enviado a uma impressora.

### Reproducao

```sh
ORIGINAL_3MF='/caminho/ORE+E+CONFIE+RESISTENTE.3mf' python3 -m unittest discover -s tests -v
node scripts/convert.js original.3mf convertido.3mf
python3 scripts/inspect_3mf.py original.3mf convertido.3mf --output comparacao.json
python3 scripts/resolve_profile.py '/caminho/system/Flashforge/machine' 'Flashforge AD5X 0.4 nozzle' ad5x-machine.json
'/Applications/Flash Studio.app/Contents/MacOS/Flash Studio' --datadir /tmp/ad5x-cli-data --load-settings ad5x-machine.json --arrange 0 --orient 0 --slice 1 --export-3mf sliced.3mf --outputdir /tmp/ad5x-cli-result convertido.3mf
```

Na interface, abrir o novo arquivo como **projeto**, mantendo suas configuracoes, e executar um novo Slice plate. Conferir camada 0.08 mm, primeira camada 0.20 mm, suportes tree(auto)/tree_slim, cores preta/branca e 60 camadas. Selecionar novamente o preset-base 0.20mm e descartar os overrides muda o processo do projeto. Nao e necessario reposicionar as partes ou editar vertices.

## Fontes tecnicas

- [Definicoes Bambu de suporte](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/PrintConfig.cpp): valores automaticos -1.
- [Definicoes FlashForge](https://github.com/FlashForge/Orca-Flashforge/blob/main/src/libslic3r/PrintConfig.cpp): tree_support_wall_count, raft_first_layer_expansion.
- [PresetBundle](https://github.com/FlashForge/Orca-Flashforge/blob/main/src/libslic3r/PresetBundle.cpp): ordem dos slots e separacao das colecoes.
- [PresetCollection::load_external_preset](https://github.com/FlashForge/Orca-Flashforge/blob/main/src/libslic3r/Preset.cpp): heranca e conservacao dos overrides.
- [CLI FlashForge](https://github.com/FlashForge/Orca-Flashforge/blob/main/src/Orca-Flashforge.cpp): validacao de compatibilidade e carregamento dos perfis.

As fontes foram consultadas em 22/10/2026; a validacao dos valores efetivamente aceitos foi feita contra o binario instalado 2.4.2.
