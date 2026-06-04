# Memoria Creativa

App web gratuita e independiente de Studio Sareschi, disponible en `/memoria-creativa/`.

## Estado de esta versión

Esta versión no incluye archivos binarios y mantiene la app funcionando con código puro:

- 12 niveles iniciales.
- Rondas después del nivel 12.
- Monedas disponibles para jugar (`playerCoins`).
- Progreso mensual hacia recompensa (`rewardProgress`).
- 1 recurso creativo gratis por mes.
- Regalo diario: recibir +50 monedas para seguir jugando, una vez al día.
- Placeholders SVG/CSS para las cartas, sin emojis raros ni cuadrado marrón tipo chocolate.
- Sonidos suaves generados con Web Audio API, sin necesidad de MP3.

## Assets preparados para una fase posterior

Este PR no incluye archivos binarios. No se agregan PNG, JPG, WEBP, MP3, WAV, PDF, ZIP, ICO ni otros assets binarios.

La app queda preparada para cargar estos archivos si se agregan en otro PR:

- Cartas reales: `assets/cards/*.png`
- Recompensa: `assets/rewards/recompensa-demo.pdf`

Si los archivos de cartas o recompensa todavía no existen, el juego sigue funcionando con placeholders visuales y el mensaje: "La recompensa estará disponible pronto." Los sonidos básicos salen desde código, por eso no se necesita subir MP3 para esta versión.

## Íconos PWA

El manifest no referencia íconos por ahora para evitar archivos binarios en este PR. En una fase posterior se pueden agregar `icon-192.png` e `icon-512.png` junto con sus referencias en `manifest.webmanifest`.


## Ajustes v4
- Íconos simplificados: regla recta, tijeras más claras y marcador en lugar del cutter confuso.
- Pantalla de juego compacta para reducir scroll en niveles altos.
- Portada con frase “Activa tu mente y encuentra los pares”.
- El antiguo bonus de compartir se cambió por “Regalo diario +50” para evitar dar monedas solo por abrir el menú de compartir.
- Service worker actualizado a memoria-creativa-v4.


V5: clip en lugar de tijeras, cutter claro, tablero más compacto, tarjetas con más volumen y niveles de movimientos un poco más amigables.

V6: fondo decorativo más pro, popup divertido del tipo de reto al inicio, clip más afinado y sobre más claro.

V7: popup del reto animado, ya no aparece estático en la home y se muestra dentro de la pantalla de juego.

V8: penalidad por error reducida de -10 a -2 monedas para que el juego sea más amable.


V9: integrado el pack de 12 cartas kawaii PNG en assets/cards y precacheado en el service worker.


V10: reemplazadas las cartas por los PNG transparentes finales enviados por Sandra.

V11: imágenes de cartas más grandes dentro del recuadro para disimular mejor el borde y llenar más la carta.

V14: retomada desde v11. Se corrige el apilado usando hidden real para que no aparezcan imagen y fallback juntos, manteniendo las cartas PNG finales.


## v15 local
- Corrige la carta de cuaderno para usar `assets/cards/cuaderno.png` en lugar del fallback SVG anterior.
- El aviso de inicio de nivel ya no se cierra solo: ahora muestra botón OK para leerlo con calma.
- Cache del service worker actualizada a v15.
