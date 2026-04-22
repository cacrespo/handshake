# Proposal: Strata - Temporal P2P Boards

## Vision
**Strata** es el sistema de mensajería de Handshake que permite a los humanos dejar huellas digitales permanentes en lugares físicos. A diferencia de las redes sociales tradicionales, la información no vive en servidores centrales, sino en las "mochilas" (caché) de las personas que habitan o han habitado esos lugares.

El sistema trata la historia de un lugar como un **palimpsesto digital**: capas de mensajes (estratos) que se acumulan en el tiempo y cuya supervivencia depende del interés colectivo por conservarlas (seedeo).

## Core Concepts

### 1. Eternal Citizenship (Derecho de Ciudadanía Eterna)
- **Validation:** Un usuario obtiene el derecho a postear en un lugar tras realizar un `Handshake` físico exitoso (vía Bluetooth/Proximidad).
- **Permanence:** Este derecho no expira. Una vez que has "tocado" un lugar, puedes seguir contribuyendo a su conversación de forma remota para siempre.
- **Identity:** La identidad es persistente dentro de cada lugar, permitiendo la construcción de una reputación histórica (ej: "el cronista de la plaza").

### 2. The Strata Architecture (Arquitectura de Estratos)
- **Merkle DAG:** Los mensajes no son un flujo lineal, sino una estructura de árbol donde cada período de tiempo (día/mes) forma un "estrato" que referencia al anterior.
- **Torrent-based:** Cada estrato es un enjambre P2P independiente. Los usuarios eligen qué capas de la historia quieren ayudar a mantener.
- **Archaeological Navigation:** Los usuarios pueden "sintonizar" su dial temporal para ver mensajes de hoy, de hace un año o del origen de la plaza.

### 3. Organic Metabolism (Metabolismo de Datos)
- **No Deletion:** No existe el concepto de "borrar". Los mensajes que no interesan a nadie pierden sus seeders y se vuelven inaccesibles (muerte orgánica).
- **Communal Preservation:** Los mensajes valiosos son replicados por la comunidad, asegurando que los "fósiles" importantes nunca desaparezcan.
- **Vocal Attenuation:** Los mensajes de usuarios remotos (ciudadanos eternos) tienen un "volumen" menor que los de los usuarios presentes físicamente, a menos que un usuario local los "re-valide".

### 4. Remote Validation (ZKP Proof of Presence)
- Para evitar el spam, los posts remotos deben incluir una prueba criptográfica (Zero-Knowledge Proof) que demuestre que el autor posee un derecho de ciudadanía para ese lugar, sin revelar su identidad global ni el momento exacto en que estuvo allí.

## Non-Goals
- No buscamos crear un sistema de búsqueda global de mensajes.
- No pretendemos garantizar la disponibilidad perpetua de toda la información (el olvido es parte del diseño).

## 5. Idea Anchors (Anclas Conceptuales)
- **Conceptual Geography:** Las ideas habitan los lugares donde los humanos las siembran. No existe un "espacio de nombres" global para conceptos; estos están anclados a la tierra.
- **Privacy via Abstraction:** Los usuarios pueden postear en la capa de un concepto sin revelar su ubicación actual, utilizando su historial de presencia física como aval.
- **Emergent Consensus:** El anclaje de una idea a un lugar es un proceso orgánico validado por el enjambre de seeders locales.
