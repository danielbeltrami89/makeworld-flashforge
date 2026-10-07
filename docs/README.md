# Calculadora de Custo para Impressão 3D

Site estático em HTML, CSS e JavaScript puro, pronto para publicar no GitHub Pages.

A tela principal mostra apenas impressora, peso, tempo e botão de cálculo. Os ajustes de material, energia, custo de máquina, perdas, mão de obra e extras ficam em **Configurações**.

Valores iniciais:

- Impressoras: FlashForge AD5X e Bambu Lab A1 mini.
- Energia: tarifa residencial convencional Enel SP B1 de `0,78938 R$/kWh` + bandeira amarela de `0,01885 R$/kWh`, totalizando `0,80823 R$/kWh`, editável nas configurações.
- Máquina e mão de obra: em branco por padrão, portanto não entram no cálculo até serem preenchidas.
- Tempo: campo único no formato `HH:MM`.

## Publicação no GitHub Pages

1. Envie a pasta `docs/` para o repositório.
2. No GitHub, abra **Settings > Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione a branch principal e a pasta **/docs**.
5. Salve e aguarde o GitHub gerar a URL.

Não há etapa de build nem dependências externas.
