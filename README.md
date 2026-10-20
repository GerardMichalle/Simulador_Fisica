# Simulador 3D 

Simulación interactiva en 3D (TypeScript + Three.js + Vite) del sistema del esquema: masa colgante que jala un carro, rampa, lanzamiento horizontal de una esfera, plataforma rotatoria, canal de salida, resorte y barra de control de descarga.

## Cómo correrlo en cualquiera de sus pc

Requiere Node.js 18 o superior.

```bash
npm install
npm run dev      # abre http://localhost:5173
npm run build    # genera la carpeta dist/ para publicar
```

## Cómo se usa , pasito a pasito

- Panel izquierdo: parámetros del sistema (cualquier cambio reinicia el experimento; "Valores por defecto" vuelve a los datos del informe).
- Panel derecho: las 7 etapas (se resalta la activa), datos en vivo y resultados del modelo comparados con los del informe.
- Barra inferior: iniciar, pausar, reiniciar, velocidad (0,25× a 2×), vistas de cámara, seguir objeto y etiquetas.
- Mouse: arrastrar para rotar, rueda para acercar.

## Estructura del proyecto hecho en TS 

```
index.html
src/
  main.ts               arranque y bucle de animación
  config.ts             datos del informe, parámetros por defecto y geometría
  geometry.ts           trazado del riel, rampa y salida
  physics/simulation.ts modelo físico (etapas 1 a 7)
  scene/world.ts        cámara, luces, controles
  scene/model.ts        modelo 3D y etiquetas
  ui/panel.ts           paneles y botones
  style.css
```

## Física que usa esta para que revisen xd

| Etapa | Modelo |
|---|---|
| 1. Masa colgante y carro | a = (m_h·g − μ·m_c·g) / (m_c + m_h); con μ = 0 resulta a = m_h·g/(m_c + m_h) |
| 2. Riel horizontal | la cuerda se suelta cuando la masa toca el piso; el carro sigue con a = −μ·g (MRUV con desaceleración ≈ −0,23 m/s²) |
| 3. Rampa | a = g·(sen θ − μ·cos θ) |
| 4. Lanzamiento | choque carro–esfera con coeficiente de restitución e; luego t_c = √(2·y₀/g), R = vₓ·t_c |
| 5. Plataforma | pista circular de radio r = 0,12 m; la fricción acelera la esfera hasta v = ω·r; F_c = mₑ·ω²·r |
| 6. Canal | plano inclinado 5° con fricción (μ = 0,05) |
| 7. Resorte | oscilador amortiguado; compresión máxima ≈ v·√(m/k); la barra se levanta y la esfera cae al depósito |

## Datos del informe usados por defecto

m_c = 0,28976 kg · θ = 10° (0,1745 rad) · L = 1,20 m · y₀ = 0,90 m · g = 9,81 m/s² · mₑ = 0,050 kg (cargas de 0,050 a 0,200 kg) · ω = 4,000 rad/s · r = 0,12 m · m_h = 10, 20 y 40 g · vₛ = 1,4873 m/s · R experimental = 0,6684 m.
Con esos valores el modelo da: a ideal = 0,32726 / 0,63339 / 1,18996 m/s², vₛ ≈ 1,4873 m/s, t_c = 0,4284 s, R = 0,637 m, F_c = 0,096 N y μₛ mínimo = 0,196.

## Supuestos que no vienen del informe 

- μ = 0,023 (riel): sale de la desaceleración de −0,23 m/s² de las gráficas v-t.
- e = 0,186 (restitución del choque carro–esfera): se calibró para reproducir vₛ = 1,4873 m/s con θ = 10° (con θ = 5° salía 0,638).
- Posición de la plataforma x = 0,757 m (R teórico 0,6371 + r 0,12): así la esfera cae justo sobre la pista circular.
- μ del canal de salida = 0,05: menor que tan 5° para que la esfera, que sale a v = ω·r = 0,48 m/s, no se frene en el canal (con 0,1 se detenía).
- μₛ de la plataforma = 0,60: el informe indica que falta medirlo.
- La polea está al final del riel (no al inicio como en el dibujo), porque la masa colgante jala al carro hacia la polea. La masa cuelga al costado de la rampa.
