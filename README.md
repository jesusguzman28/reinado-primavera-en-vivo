# Reinado de Primavera 2026 · En vivo

Pantalla pública del Reinado de Primavera del Instituto Paucar del Sarasara,
para seguir el evento desde cualquier celular o computadora.

Es una página estática (GitHub Pages) que **solo lee** el nodo `/publico` de
Firebase Realtime Database. Ese nodo lo publica, con cada cambio, el sistema
del evento ([reinado-primavera](https://github.com/jesusguzman28/reinado-primavera), Laravel).

```
Laptop del evento (Laravel) ──escribe──▶ Firebase /publico ──en vivo──▶ esta página
```

- Muestra lo mismo que el proyector: votación, conteo de sobres (solo el
  llamado actual de la participante en el atril), intermedio con cuenta
  regresiva y la revelación de la ganadora.
- Mientras no llega la revelación, `/publico` no trae cifras ni puestos.
- Las reglas de Firebase dejan leer solo `/publico` y no dejan escribir nada
  desde fuera: esta página no puede cambiar el evento.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la página |
| `js/app.js` | Conexión a Firebase y los cuatro modos con sus animaciones |
| `css/app.css` | Estilos (los mismos del proyector) |
| `css/extra.css` | Estados propios de la web (conectando, sin conexión) |
| `img/` | Fotos de las candidatas y de la reina 2025 |

Si cambian las fotos en el sistema, hay que copiarlas también a `img/` con el
mismo nombre (`img/candidatas/nombre-apellido.jpg`).

## Probar en local

```bash
php -S 127.0.0.1:8090    # o cualquier servidor estático
```
