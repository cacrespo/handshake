# Guía de Prueba: Sincronización Multi-Dispositivo (P2P)

Sigue estos pasos para verificar que Strata está sincronizando mensajes correctamente entre diferentes computadoras a través de Internet.

## 1. Instalación (En cada máquina)

Asegúrate de tener Python 3.13+ y `uv` instalado.

```bash
# Sincronizar dependencias
uv sync
```

## 2. Configurar Identidad y Confianza

Cada máquina necesita conocer la clave pública de las demás para validar los mensajes.

1. **Obtener tu Clave:**
   En cada máquina, ejecuta:
   ```bash
   uv run strata handshake
   ```
   Copia la `Public Key` (ej: `a1b2c3d4...`).

2. **Agregar Contactos:**
   En la **Máquina A**, agrega la clave de la **Máquina B**:
   ```bash
   uv run strata contact add <PK_MAQUINA_B> "Amigo-B"
   ```
   *(Repite este proceso en todas las máquinas para crear tu red de confianza).*

## 3. Iniciar el Nodo de Red

Para que las máquinas se encuentren, deben estar "escuchando" en la misma ubicación geográfica (Geohash).

En **todas** las máquinas, inicia el nodo:
```bash
uv run strata node --lat 40.41 --lon -3.70
```
*Mantén esta terminal abierta. Verás estadísticas de "Peers" y velocidades de subida/bajada.*

## 4. Prueba de Fuego: Mensajería

Mientras el nodo corre en una terminal, abre **otra terminal** para interactuar:

1. **Escribir (Máquina A):**
   ```bash
   uv run strata write "¡Hola desde la Máquina A! El sistema P2P funciona." --lat 40.41 --lon -3.70
   ```

2. **Diagnóstico (Opcional - Cualquier Máquina):**
   Ejecuta el script de diagnóstico para ver si hay conexión real entre pares:
   ```bash
   uv run python src/strata/diag.py
   ```

3. **Leer (Máquina B/C):**
   Espera unos 30-60 segundos para la propagación de BitTorrent y ejecuta:
   ```bash
   uv run strata read --lat 40.41 --lon -3.70
   ```
   *Deberías ver el mensaje con el alias "Amigo-A" verificado.*

## Solución de Problemas
- **Peers: 0**: Si después de 2 minutos no ves pares, verifica que el puerto `6881` (TCP/UDP) no esté bloqueado.
- **Mensaje no aparece**: BitTorrent depende de la disponibilidad de los pares. Asegúrate de que la Máquina A siga corriendo el comando `node` mientras la Máquina B intenta leer.
