# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

```
CryptoTrading/
├── index.html          # 진입점 — 모든 CSS/JS 파일을 여기서 참조
├── css/                # 기능별 CSS 파일
│   └── *.css
├── js/                 # 기능별 JS 파일
│   └── *.js
└── docs/
```

## File Organization Rules

- `index.html` 은 반드시 최상위 경로에 위치해야 한다.
- HTML, CSS, JS 파일은 반드시 분리한다. 인라인 `<style>` 또는 인라인 `<script>` 는 사용하지 않는다.
- CSS 파일과 JS 파일은 기능 단위로 분리한다 (예: `css/chart.css`, `js/chart.js`, `css/trade.css`, `js/trade.js`).
- 모든 CSS/JS 파일은 `index.html` 의 `<head>` 또는 `<body>` 하단에서 참조한다.
