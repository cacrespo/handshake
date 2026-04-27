# Tasks: Strata - Hito 1 (The Swarm Motor)

## Fase 1.1: El ADN del Mensaje (Estructura de Datos)
- [x] **Esquema Universal:** Definir el JSON del mensaje (autor, geohash, timestamp, contenido).
- [x] **Firmado Criptográfico:** Implementar la lógica de firma y verificación usando claves Ed25519.
- [x] **Validación de Ubicación:** Implementar la estructura para adjuntar pruebas de GPS (Hito 1) y Bluetooth (Hito 3).

## Fase 1.2: Cartografía Digital (Geohash Mapping)
- [x] **Traductor de Coordenadas:** Función que convierta `lat, lon` en Geohash (usando precisión variable).
- [x] **Generador de InfoHash:** Lógica para derivar el `InfoHash` del Torrent a partir del `Geohash + Época + [OwnerKey]`.
- [x] **Capa Pública vs Anclada:** Implementar la lógica de resolución para ambos tipos de enjambres.

## Fase 1.3: El Motor P2P (BitTorrent Core)
- [x] **Integración de Cliente Torrent:** Seleccionar e implementar una librería P2P (`libtorrent`).
- [x] **Gestor de Directorios:** Lógica para mapear cada `InfoHash` a una carpeta local de mensajes `.msg`.
- [x] **Local Gossip Sync:** Added `SyncEngine` for inventory exchange over UDP.
- [ ] **Sincronización Oportunista:** Implementar el escaneo automático de nuevos archivos en el swarm (BitTorrent level).

## Fase 1.4: La Interfaz CLI (Agnóstica)
- [x] **Comando `write`:** `strata write --place <geohash> --msg "texto"`.
- [x] **Comando `read`:** `strata read --place <geohash>` (lists verified messages).
- [x] **Comando `node`:** Starts global seeding and local gossip.
- [ ] **Simulador de "Mochila":** Gestión de la caché local y límites de almacenamiento (Metabolismo inicial).

## Futuro: Hitos 2 y 3
- [ ] (Hito 2) Implementar protocolo de Handshake social.
- [ ] (Hito 3) Integración Bluetooth Low Energy (BLE) para PoP.
- [ ] (Hito 3) Desarrollo de la interfaz móvil nativa.
