# Tasks: Strata - Hito 1 (The Swarm Motor)

## Fase 1.1: El ADN del Mensaje (Estructura de Datos)
- [ ] **Esquema Universal:** Definir el JSON del mensaje (autor, geohash, timestamp, contenido).
- [ ] **Firmado Criptográfico:** Implementar la lógica de firma y verificación usando claves Ed25519.
- [ ] **Validación de Ubicación:** Implementar la estructura para adjuntar pruebas de GPS (Hito 1) y Bluetooth (Hito 3).

## Fase 1.2: Cartografía Digital (Geohash Mapping)
- [ ] **Traductor de Coordenadas:** Función que convierta `lat, lon` en Geohash (usando precisión variable).
- [ ] **Generador de InfoHash:** Lógica para derivar el `InfoHash` del Torrent a partir del `Geohash + Época + [OwnerKey]`.
- [ ] **Capa Pública vs Anclada:** Implementar la lógica de resolución para ambos tipos de enjambres.

## Fase 1.3: El Motor P2P (BitTorrent Core)
- [ ] **Integración de Cliente Torrent:** Seleccionar e implementar una librería P2P (ej: `libtorrent-python` o similar).
- [ ] **Gestor de Directorios:** Lógica para mapear cada `InfoHash` a una carpeta local de mensajes `.msg`.
- [ ] **Sincronización Oportunista:** Implementar el escaneo automático de nuevos archivos en el swarm.

## Fase 1.4: La Interfaz CLI (Agnóstica)
- [ ] **Comando `write`:** `strata write --place <geohash> --msg "texto"`.
- [ ] **Comando `read`:** `strata read --place <geohash>` (lista mensajes ordenados por preponderancia).
- [ ] **Simulador de "Mochila":** Gestión de la caché local y límites de almacenamiento (Metabolismo inicial).

## Futuro: Hitos 2 y 3
- [ ] (Hito 2) Implementar protocolo de Handshake social.
- [ ] (Hito 3) Integración Bluetooth Low Energy (BLE) para PoP.
- [ ] (Hito 3) Desarrollo de la interfaz móvil nativa.
