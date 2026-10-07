# MakerWorld → FlashForge AD5X

Extensão Chrome (Manifest V3) em estágio inicial para adicionar ao MakerWorld uma opção de download direcionada à **FlashForge AD5X** e converter localmente projetos `.3mf` originalmente preparados para o ecossistema Bambu/Orca.

## Calculadora de custo para impressão 3D

Este repositório também inclui uma calculadora estática em `docs/`, pensada para publicação no GitHub Pages. Ela calcula custo unitário e custo total do lote considerando material, tempo de impressão, energia, perdas e extras. Custos de máquina e mão de obra ficam em branco por padrão e só entram no cálculo se forem preenchidos. A interface principal fica reduzida a impressora, peso, tempo e botão de cálculo, com configurações avançadas recolhidas.

Para publicar, configure o GitHub Pages em **Settings > Pages** usando a branch principal e a pasta **/docs**. Não há build nem dependências externas.

## Contexto do projeto

O objetivo é melhorar o fluxo de quem encontra modelos no MakerWorld mas imprime em uma FlashForge AD5X.

Hoje o MakerWorld normalmente oferece opções como:

- Download 3MF
- Open in Bambu Studio
- Download STL/CAD Files

A proposta desta extensão é adicionar uma terceira opção específica no menu verde, por exemplo:

**Download for FlashForge AD5X**

Ao selecionar essa opção, a extensão deve obter o 3MF original do MakerWorld, converter o projeto no próprio navegador e baixar um novo `.3mf` compatível com Flash Studio/OrcaSlicer e preparado para a AD5X.

O projeto foi inspirado no tipo de conversão feito por serviços como ForgeBridge, mas a intenção aqui é que a conversão seja **100% local**, sem enviar o arquivo do usuário para um servidor externo.

## Objetivo técnico

A extensão não deve tratar o problema como uma simples troca de extensão de arquivo. Bambu Studio, OrcaSlicer e Flash Studio utilizam 3MF, mas há diferenças importantes nos metadados, perfis de máquina, nomes de parâmetros e configurações específicas de hardware.

A estratégia desejada é:

1. preservar a geometria, posições, placas e informações úteis do projeto;
2. preservar configurações de processo que são genéricas e fazem sentido na AD5X;
3. traduzir parâmetros equivalentes quando os nomes diferirem;
4. remover configurações exclusivas da Bambu que não devem ser transferidas;
5. substituir configurações específicas de máquina por valores/perfis apropriados da FlashForge AD5X;
6. preservar, quando possível, pintura multicolorida e associação de filamentos;
7. gerar um novo 3MF que possa ser aberto como projeto no Flash Studio/OrcaSlicer.

## Impressora alvo inicial

Nesta primeira fase, suportar somente:

- **FlashForge AD5X**
- nozzle de **0,4 mm**
- até **4 cores / IFS**

Não é necessário tentar suportar todas as impressoras FlashForge agora. A prioridade é fazer a AD5X funcionar de forma confiável antes de generalizar a arquitetura.

## Arquitetura atual

Os principais arquivos são:

- `manifest.json` — configuração Manifest V3 da extensão.
- `content.js` — integra a opção da FlashForge à interface do MakerWorld.
- `background.js` — coordena a ação de download/interceptação.
- `offscreen.html` / `offscreen.js` — executam a conversão/download fora do content script.
- `zip.js` — leitura/escrita do container ZIP usado pelo 3MF.
- `converter.js` — lógica inicial de conversão Bambu → FlashForge.

A separação entre UI da extensão e conversor deve ser mantida. Idealmente, a lógica de conversão deve continuar desacoplada para que no futuro possa ser reaproveitada em uma CLI, site ou aplicativo desktop.

## Comportamento esperado no MakerWorld

A extensão deve injetar uma nova opção no menu do botão verde do MakerWorld, mantendo as opções existentes intactas.

Exemplo:

```text
Download 3MF
Open in Bambu Studio
Download STL/CAD Files
────────────────────────
Download for FlashForge AD5X
```

O MakerWorld é uma aplicação web dinâmica. Portanto, não depender excessivamente de classes CSS geradas. Preferir seletores/estratégias baseadas em estrutura, atributos estáveis e, quando inevitável, texto visível. Usar `MutationObserver` quando necessário para detectar menus criados dinamicamente.

## Conversão 3MF

Um arquivo 3MF usado pelos slicers é essencialmente um pacote ZIP contendo XMLs e arquivos de configuração/metadados.

A geometria normalmente pode ser preservada. O maior risco está nas configurações específicas do slicer/máquina.

### Configurações que devem, em princípio, ser preservadas

Exemplos:

- layer height
- first layer height
- wall loops
- top/bottom layers
- infill density
- infill pattern
- supports
- painted supports
- seams
- brim / raft
- ironing
- modifiers
- per-object settings
- painted colors
- posicionamento dos objetos
- múltiplas plates

### Configurações que não devem ser copiadas cegamente

Exemplos:

- machine start G-code
- machine end G-code
- limites de aceleração
- jerk
- velocidades máximas de máquina
- rotinas AMS específicas da Bambu
- purge routines específicas da Bambu
- nozzle cleaning específico da Bambu
- probing/start sequence específico da máquina
- machine profile IDs da Bambu
- dimensões/limites específicos de outra impressora

Esses itens devem ser removidos, traduzidos ou substituídos por valores/perfis da AD5X.

## Cores e IFS

O objetivo é mapear até quatro materiais/cores utilizados no projeto para os quatro canais do IFS da AD5X.

Fluxo esperado:

```text
Filament 1 → IFS 1
Filament 2 → IFS 2
Filament 3 → IFS 3
Filament 4 → IFS 4
```

Quando possível, preservar:

- cor
- tipo de material
- temperatura do nozzle
- temperatura da mesa

Se o projeto usar mais de quatro cores realmente necessárias, a extensão não deve converter silenciosamente como se tudo estivesse correto. Deve avisar o usuário e, no futuro, permitir escolher quais cores manter/remapear.

## Perfis da AD5X

Evitar inventar valores de máquina. A direção desejada é usar como referência os perfis oficiais/compatíveis da AD5X disponíveis no ecossistema OrcaSlicer/Flash Studio.

O conversor deve combinar:

```text
intenção/configuração útil do projeto original
+
perfil correto da AD5X
```

em vez de simplesmente renomear Bambu para FlashForge.

## Coordenadas e área da mesa

É necessário validar os sistemas de coordenadas utilizados pelos projetos Bambu e pela AD5X. Um modelo pode ter geometria correta e ainda abrir deslocado ou fora da plate.

Portanto, revisar cuidadosamente:

- origem da plate;
- centro da área de impressão;
- transforms dos objetos;
- dimensões da máquina de origem;
- dimensões/limites da AD5X;
- múltiplas plates.

Não aplicar uma transformação fixa sem confirmar como os transforms são armazenados nos 3MF reais.

## Estado atual da v0.1

A versão incluída neste ZIP é um **protótipo funcional/experimental**, não uma conversão completa de todos os parâmetros Bambu ↔ FlashForge.

Ela já contém a estrutura da extensão e uma implementação inicial do conversor, incluindo ideias como:

- execução local;
- leitura/reempacotamento do 3MF;
- preservação de arquivos que não precisam ser modificados;
- substituição da identidade da impressora;
- remoção de alguns overrides específicos de máquina;
- tradução inicial de alguns parâmetros;
- preparação para abrir o resultado como projeto no Flash Studio/OrcaSlicer.

Antes de considerar a extensão pronta, é necessário validar com arquivos 3MF reais do MakerWorld e comparar o resultado no Flash Studio.

## Prioridades para continuar no Codex

1. **Fazer a integração do menu do MakerWorld ficar robusta.**
   - Confirmar o DOM atual.
   - Garantir que o item apareça somente uma vez.
   - Não quebrar as opções originais.

2. **Confirmar o fluxo real de obtenção do 3MF.**
   - Ver como o MakerWorld gera/autoriza o link de download.
   - Evitar depender de hacks frágeis quando houver uma URL/API observável no fluxo normal.

3. **Testar o parser ZIP/3MF com arquivos reais.**
   - Validar CRC, compressão e reempacotamento.
   - Garantir que Flash Studio e OrcaSlicer aceitem o arquivo gerado sem reparo.

4. **Mapear a estrutura de metadados Bambu/Orca.**
   - `Metadata/model_settings.config`
   - `Metadata/project_settings.config`
   - `Metadata/slice_info.config`
   - outros arquivos presentes em projetos reais.

5. **Usar o perfil real da FlashForge AD5X 0.4.**
   - Não apenas alterar o nome da impressora.
   - Substituir corretamente propriedades específicas de máquina.

6. **Criar uma tabela explícita de conversão de settings.**

   Sugestão de classificação:

   ```ts
   type SettingAction =
     | "KEEP"
     | "RENAME"
     | "FLASHFORGE_DEFAULT"
     | "DROP"
     | "CLAMP";
   ```

7. **Validar multicolor/IFS.**
   - Testar projetos com 1, 2, 3 e 4 cores.
   - Confirmar preservação de pintura por face/região.

8. **Validar posicionamento da plate.**
   - A1/A1 mini/P1/X1 como origem.
   - AD5X como destino.

9. **Adicionar relatório de conversão.**

   Algo como:

   ```text
   Source printer: Bambu Lab A1 Mini
   Target printer: FlashForge AD5X
   Plates: 3
   Objects: 12
   Colors used: 4
   Process settings preserved: 37
   Settings renamed: 4
   Machine settings replaced: 18
   Unsupported settings dropped: 7
   Warnings: 0
   ```

10. **Adicionar testes automatizados.**
    - fixtures de 3MF pequenos;
    - single color;
    - 4 colors;
    - supports;
    - multiple plates;
    - modifiers;
    - diferentes impressoras Bambu de origem.

## Critério de sucesso

Um teste deve ser considerado bem-sucedido quando:

1. o usuário abre um modelo no MakerWorld;
2. escolhe `Download for FlashForge AD5X`;
3. recebe um `.3mf` convertido localmente;
4. abre o arquivo no Flash Studio/OrcaSlicer como projeto;
5. geometria e posições estão corretas;
6. nenhuma peça aparece fora da plate;
7. as cores do projeto continuam associadas corretamente ao IFS;
8. configurações de processo relevantes foram preservadas;
9. configurações perigosas/específicas da Bambu não sobrescrevem o perfil da AD5X;
10. o projeto pode ser fatiado normalmente para a AD5X.

## Princípio importante para o desenvolvimento

**Preservar a intenção do autor, não a configuração física de outra impressora.**

Por exemplo: paredes, infill, suportes e layer height expressam a intenção do perfil. Já aceleração máxima, start G-code, rotina AMS e dimensões da máquina pertencem ao hardware de origem e não devem ser carregados cegamente para a AD5X.

---

Este README existe principalmente para contextualizar a continuação do trabalho no Codex. Leia o código atual como um ponto de partida e valide cada hipótese contra 3MFs reais antes de ampliar o conversor.
