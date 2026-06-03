# Memoria Creativa

App web gratuita e independiente de Studio Sareschi, disponible en `/memoria-creativa/`.

## Assets preparados para una fase posterior

Este PR no incluye archivos binarios. No se agregan PNG, JPG, WEBP, MP3, WAV, PDF, ZIP, ICO ni otros assets binarios.

La app queda preparada para cargar estos archivos si se agregan en otro PR:

- Cartas reales: `assets/cards/*.png`
- Sonidos opcionales: `assets/sounds/flip.mp3`, `match.mp3`, `error.mp3`, `coins.mp3`, `win.mp3`
- Recompensa: `assets/rewards/recompensa-demo.pdf`

Si esos archivos no existen, el juego sigue funcionando con placeholders visuales, sonidos silenciados de forma segura y el mensaje: "La recompensa estará disponible pronto."

## Íconos PWA

El manifest no referencia íconos por ahora para evitar archivos binarios en este PR. En una fase posterior se pueden agregar `icon-192.png` e `icon-512.png` junto con sus referencias en `manifest.webmanifest`.
