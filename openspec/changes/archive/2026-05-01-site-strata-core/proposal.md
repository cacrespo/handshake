# Proposal: Strata - Geographic P2P Swarms & Digital Palimpsests

## Vision
**Strata** es el motor de persistencia de Handshake que permite a los humanos dejar huellas digitales permanentes en lugares físicos. La información no vive en servidores centrales, sino en las "mochilas" (caché) de las personas, tratando la historia de un lugar como un **palimpsesto digital**: capas de mensajes (estratos) que se acumulan y cuya supervivencia depende del interés colectivo (seedeo).

El sistema evoluciona desde un motor de intercambio de archivos P2P puro hacia un sistema de validación física y ciudadanía histórica.

## Core Concepts

### 1. The Dual Layer (Arquitectura de Doble Capa)
Cada coordenada geográfica (Geohash) posee dos niveles de existencia:
- **Capa Pública (El Suelo):** Un tablón anárquico y efímero donde cualquiera puede escribir. El InfoHash depende solo del Geohash. Es la memoria inmediata del lugar.
- **Capa de Ciudadanía (Los Estratos):** Espacios anclados por dueños o comunidades. Aquí es donde vive la "Ciudadanía Eterna": una vez que has realizado un Handshake físico (Hito 3), obtienes el derecho a postear en estos estratos de forma remota para siempre.

### 2. The Strata Architecture (Merkle DAG & Torrents)
Los mensajes no son un flujo lineal, sino una estructura de árbol organizada en **Épocas**:
- **Epochs:** Cada periodo de tiempo forma un "estrato" (un InfoHash de Torrent independiente).
- **Archaeological Navigation:** Los usuarios pueden "sintonizar" su dial para descargar y ver mensajes de hoy o de estratos históricos.
- **Geographic Mapping:** El sistema traduce `Geohash + Época` en un `InfoHash` de BitTorrent.

### 3. Organic Metabolism (Persistencia por Interés)
- **Survival:** Un mensaje vive mientras haya personas (seeders) interesadas en conservarlo.
- **Vocal Attenuation:** Los mensajes de usuarios presentes físicamente brillan más (preponderancia). Los mensajes remotos requieren de la validación del enjambre local para no ser enterrados por el "olvido orgánico".

### 4. Idea Anchors (Anclaje Conceptual)
Las ideas habitan los lugares. Los usuarios pueden etiquetar mensajes con conceptos, creando una geografía conceptual donde las ideas solo se propagan si los humanos las llevan de un lugar a otro (Hito 2).

## Roadmap Progresivo

### Hito 1: El Motor del Enjambre (Agnóstico)
- Implementación de la lógica de Swarms por Geohash y Época.
- Motor CLI para escritura y lectura de mensajes JSON firmados.
- Capa Pública funcional sin hardware específico.

### Hito 2: Puentes Humanos (Capa Social)
- Protocolo de Handshake (intercambio de llaves).
- Social Relays para ver y seeder muros lejanos a través de contactos de confianza.

### Hito 3: Ciudadanía Eterna (App Móvil & PoP)
- Validación Bluetooth Proof-of-Presence (PoP).
- Aplicación móvil nativa con dial de tiempo.
- ZKP para privacidad en posts remotos de ciudadanos históricos.

## Non-Goals
- No es un chat de mensajería instantánea; es una bitácora colectiva del espacio.
- No hay búsqueda global; la información se descubre por proximidad o red social.
