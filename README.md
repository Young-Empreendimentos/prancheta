# Prancheta — memorial de loteamento

Ferramenta da **Young Empreendimentos** que lê o **DXF** do loteamento (exportado do AutoCAD) e gera, de forma **determinística e sem IA**, os **memoriais descritivos** que originam as matrículas no cartório:

- memorial de cada **lote** (começando pela frente / lado voltado à rua; em lote de esquina, a frente é o menor lado);
- memorial da **gleba** (perímetro);
- memoriais das **áreas públicas** (verde, institucional, sistema viário);
- **quadro de áreas** com percentuais (Lei 6.766).

As confrontações (lote↔lote, lote↔área, lote↔rua) são identificadas automaticamente pela geometria. O que não é geometricamente certo, a ferramenta **pergunta ao operador** — nunca chuta.

## Como rodar

```bash
npm install
npm run dev      # abre em http://localhost:5180
```

Produção:

```bash
npm run build    # gera dist/
npm run preview  # serve o build
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/engine/dxf.js` | leitor de DXF (blocos, arcos/bulge, acentos ANSI/UTF-8) |
| `src/engine/geometry.js` | azimute, área com arcos, ponto-em-polígono, coincidência de arestas |
| `src/engine/loteamento.js` | motor: lotes, confrontações, ruas, gleba, quadro de áreas |
| `src/engine/extenso.js` | número/área por extenso (pt-BR) |
| `src/engine/draw.js` | render do desenho no canvas |
| `src/export/docx.js` | exportação Word (.docx) no padrão do cartório |
| `src/components/` | telas (viewer, painéis, modal) |

## Precisão

Requisito nº 1. As medidas viram matrícula — não pode haver erro na exportação. O motor é determinístico: mesmo DXF + mesmas respostas = mesmo memorial, sempre.
