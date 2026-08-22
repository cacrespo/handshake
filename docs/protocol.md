# Protocolo Handshake: Especificación del Sistema Espacio-Temporal P2P

**Versión:** `v0.2.0-draft` (Trabajo en Progreso)

> [!WARNING]
> Este documento representa la especificación técnica oficial del protocolo Handshake. La especificación se encuentra en proceso de refinamiento continuo.

Este documento define la especificación técnica del protocolo **Handshake** para asegurar la interoperabilidad entre clientes (Web frontend con TypeScript y motor de escritorio/CLI en Python).

---

## Principio y Fundamento

### 1. La Visión
La mayoría de las redes tradicionales están centradas en la identidad abstracta: perfiles, cuentas, seguidores y métricas de reputación digital. En un entorno donde distinguir entre humanos, bots o identidades sintéticas es irrelevante o imposible en el plano virtual, **Handshake desplaza el centro de gravedad desde las personas hacia los mensajes**.

La red no busca gestionar ni validar perfiles virtuales. En su lugar, el sistema es una trama viva de **mensajes y graffitis anclados en coordenadas exactas de espacio y tiempo**.

La validación de lo humano no ocurre mediante algoritmos de verificación digital, sino a través del **encuentro físico real**. El protocolo empuja hacia la presencia y la proximidad física, pero en el plano virtual la unidad fundamental es siempre la huella (el mensaje), no la cuenta ni la persona.

### 2. Intenciones y Filosofía del Protocolo
*   **El Mensaje como Unidad Soberana:** No existen muros personales, cuentas infladas ni feeds de usuarios. Hay graffitis en el espacio-tiempo. Un mensaje vale y existe por su ubicación, su contenido y el interés colectivo en preservarlo.
*   **La Geografía y el Tiempo como el Algoritmo:** La visibilidad y el descubrimiento dependen de la geografía y el momento temporal. No existen algoritmos de atención ni optimización de engagement: para encontrar una huella digital, debes explorar esas coordenadas.
*   **Custodia y Seeding Colectivo (Soberanía de Datos):** La red no depende de un servidor central propietario. Cualquier persona puede seedear mensajes, decidiendo libremente qué partes de la memoria espacial desea conservar, replicar o descartar en su propio almacenamiento local, actuando como custodio de la memoria histórica de su entorno.
*   **Puente hacia el Encuentro Físico:** Aunque la red virtual almacena e intercambia mensajes sin importar el origen abstracto del autor, el protocolo incentiva y celebra el encuentro en el mundo real como el único espacio genuino de validación y conexión humana.

---

## 1. Identidad Criptográfica

El protocolo no implementa conceptos de "cuentas de usuario", "registros" ni "perfiles". La identidad en Handshake es puramente criptográfica, descentralizada y orientada a la firma de mensajes:

*   **Pares de Claves Ed25519:** Cada nodo o emisor utiliza un par de claves asimétricas Ed25519:
    *   **Clave Privada (SK):** Instrumento local para firmar digitalmente los graffitis emitidos. Se mantiene strictly en el almacenamiento del cliente.
    *   **Clave Pública (PK):** Identificador del autor (`author_pk`) utilizado por el enjambre P2P para verificar la integridad y autenticidad del mensaje y certificar que no fue alterado durante el transporte.
*   **Pseudonimato Opcional:** Un usuario puede reutilizar su par de claves para mantener consistencia como autor o generar claves efímeras para emitir mensajes puntuales. El protocolo no vincula nombres, correos ni datos personales a ninguna clave.

### Formato de Portabilidad de Identidad (`.key`):
Para permitir la importación y exportación soberana de llaves entre clientes (Web, CLI, móvil) sin depender de servidores:
```json
{
  "public_key": "clave_publica_en_hexadecimal_64_caracteres",
  "private_key": "clave_privada_en_hexadecimal_64_o_128_caracteres"
}
```

---

## 2. Estructura del Mensaje (Schema)

Todos los graffitis en la red son públicos, abiertos e inmutables. Se representan y transmiten utilizando serialización JSON estricta. El esquema consta de tres bloques principales: `header`, `location` y `content`.

```json
{
  "version": "1.0",
  "header": {
    "author_pk": "hex_public_key_32_bytes",
    "parent_signature": "hex_parent_signature_64_bytes_optional",
    "timestamp": 1712345678,
    "signature": "hex_signature_64_bytes"
  },
  "location": {
    "geohash": "dr5reg6",
    "coordinates": {
      "lat": 40.712776,
      "lon": -74.005974
    }
  },
  "content": {
    "text": "Texto del graffiti anclado en el espacio-tiempo",
    "attachments": [
      {
        "url": "https://example.com/audio.ogg",
        "sha256": "hash_sha256_hexadecimal_de_64_caracteres",
        "mime_type": "audio/ogg"
      }
    ]
  }
}
```

### Campos:
*   `header.author_pk`: Clave pública Ed25519 (string hexadecimal de 64 caracteres / 32 bytes) del autor que firmó el graffiti.
*   `header.parent_signature` (Opcional): Firma Ed25519 del graffiti padre al que responde este mensaje (`null` si inicia una nueva conversación o huella independiente). Permite formar árboles y grafos de conversación espaciales.
*   `header.timestamp`: Marca de tiempo UNIX (en segundos) en la que fue emitido el graffiti.
*   `header.signature`: Firma digital Ed25519 del objeto serializado en formato canónico (excluyendo este mismo campo).
*   `location.geohash`: Geohash estándar (longitud configurable, típicamente 5-7 caracteres) utilizado para indexar y descubrir enjambres espaciales de peers en el área.
*   `location.coordinates`: Coordenadas geográficas exactas de alta precisión (`lat`, `lon`) para su renderizado en el mapa.
*   `content.text`: Contenido textual del mensaje (obligatorio, texto plano o markdown simple).
*   `content.attachments` (Opcional): Lista de archivos multimedia vinculados. Cada elemento incluye `url` de descarga, `sha256` para verificación criptográfica de integridad y `mime_type`.

### Serialización Canónica para la Firma:
Para generar o verificar la firma Ed25519:
1. Se toma el JSON del mensaje **excluyendo el campo `header.signature`**.
2. Se ordenan de forma recursiva todas sus claves alfabéticamente (`sort_keys=True` en Python / ordenamiento alfabético de propiedades de objeto en TypeScript).
3. Se genera la cadena JSON normalizada sin espacios superfluos, se codifica en UTF-8 y se firma/verifica con la clave Ed25519.

### Extensibilidad y Preservación de Datos:
*   **Campos Desconocidos:** Si un cliente recibe un mensaje que contiene campos adicionales no contemplados en su versión, debe ignorarlos para el renderizado local, pero **debe preservarlos intactos** en el archivo JSON almacenado en disco y al retransmitirlo al enjambre P2P.
*   **Inmutabilidad de la Firma:** Modificar, omitir o reordenar cualquier campo invalidará la firma criptográfica Ed25519 del mensaje original.

---

## 3. Agrupación en Enjambres (Swarm Grouping)
Los graffitis no se transmiten de forma aislada, sino agrupados en **directorios espaciales y temporales**:

1.  **Resolución Espacial:** El territorio se divide en celdas usando **Geohash de precisión 6 o 7** (entre ~1.2 km y ~150 metros).
2.  **Resolución Temporal:** El tiempo se agrupa en **épocas mensuales** en formato `YYYY-MM`.
3.  **Generación de InfoHash:** Se calcula un identificador determinista SHA-1 para el enjambre:
    $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$
4.  **Sedeo Colectivo:** Las conexiones (WebRTC en Web o P2P de escritorio) intercambian los mensajes pertenecientes a dicho `InfoHash`. Cada archivo se almacena localmente como:
    `{timestamp}_{author_pk_prefix}.msg`
5.  **Custodia Histórica:** Los nodos pueden sembrar tanto la época actual como épocas pasadas custodiadas en su almacenamiento local, preservando la memoria histórica de su entorno geográfico.

---

## 4. Almacenamiento Soberano, Metabolismo y DuckDB Embebido

El protocolo adopta **DuckDB** como el motor estándar de base de datos OLAP embebida tanto para clientes Web (`@duckdb/duckdb-wasm` en IndexedDB) como para clientes de escritorio/servidor (`duckdb` en Python).

### Esquema de Base de Datos Local (`graffitis`)
```sql
CREATE TABLE IF NOT EXISTS graffitis (
    signature VARCHAR PRIMARY KEY,         -- Firma Ed25519 única del mensaje
    author_pk VARCHAR NOT NULL,           -- Clave pública del emisor
    parent_signature VARCHAR,             -- Firma del mensaje padre (para hilos)
    timestamp BIGINT NOT NULL,            -- Timestamp UNIX
    geohash VARCHAR NOT NULL,             -- Geohash espacial (ej. 'dr5reg6')
    lat DOUBLE NOT NULL,                  -- Latitud de precisión
    lon DOUBLE NOT NULL,                  -- Longitud de precisión
    content_text TEXT NOT NULL,           -- Texto del graffiti
    attachments_json JSON,                -- Adjuntos multimedia serializados
    is_pinned BOOLEAN DEFAULT FALSE,      -- Marcado manual para fijar/custodiar
    raw_json JSON NOT NULL                -- JSON completo canónico para re-seedeo P2P
);

CREATE INDEX IF NOT EXISTS idx_spatial ON graffitis(geohash);
CREATE INDEX IF NOT EXISTS idx_time ON graffitis(timestamp);
CREATE INDEX IF NOT EXISTS idx_parent ON graffitis(parent_signature);
```

### Consultas Clave en DuckDB:

1. **Recuperación Espacio-Temporal para el Mapa:**
   ```sql
   SELECT * FROM graffitis
   WHERE geohash LIKE 'dr5re%'
     AND timestamp BETWEEN :start_ts AND :end_ts
   ORDER BY timestamp DESC;
   ```

2. **Reconstrucción del Árbol de Hilos de Conversación:**
   ```sql
   WITH RECURSIVE thread AS (
       SELECT * FROM graffitis WHERE signature = :target_signature
       UNION ALL
       SELECT g.* FROM graffitis g
       JOIN thread t ON g.parent_signature = t.signature
   )
   SELECT * FROM thread ORDER BY timestamp ASC;
   ```

3. **Metabolismo y Purga de Almacenamiento (Tope Configurable):**
   ```sql
   -- Eliminar los mensajes más antiguos que no estén fijados ni sean de contactos de Handshake
   DELETE FROM graffitis
   WHERE is_pinned = FALSE
     AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
     AND signature IN (
         SELECT signature FROM graffitis
         WHERE is_pinned = FALSE
           AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
         ORDER BY timestamp ASC
         LIMIT :purge_count
     );
   ```

### El Rol del Handshake (Validación Presencial) y Protección:
*   **Handshake Presencial:** Intercambio directo de claves públicas (ej. código QR cara a cara) que se almacenan en la tabla local `trusted_handshakes(public_key, name, added_at)`.
*   **Prominencia e Inmunidad:** Los graffitis emitidos por claves presentes en `trusted_handshakes` o marcados como `is_pinned = TRUE` son exentos de la purga automática por cuota de almacenamiento.

---

## 5. Descubrimiento Social de Enjambres (Social Relays)
*   **Anuncio de Relays:** Al conectarse con peers, los clientes pueden anunciar la lista de celdas espaciales (`InfoHashes`) que custodian activamente.
*   **Sedeo Solidario:** Si un nodo detecta que un contacto de su lista de Handshakes custodia enjambres distantes, puede optar por actuar como sembrador de respaldo para apoyar la preservación de esas huellas.

---

## 6. Naturaleza Declarativa del Espacio-Tiempo
*   **Carácter Declarativo:** La ubicación (`geohash` y coordenadas) y la estampa de tiempo (`timestamp`) de un graffiti son declarativas e intencionales: el autor decide plasmar su huella en esas coordenadas, análogo a pintar un muro real en la ciudad.
*   **Prueba Opcional de Co-presencia:** Un graffiti puede incluir opcionalmente firmas de peers testigos en el área (`location.proof`) para certificar presencia simultánea verificable.

---

## 7. Tracker y Privacidad Espacial (Signaling)
El tracker actúa exclusivamente como servidor de señalización para conectar peers interesados en el mismo espacio-tiempo:
*   **Conexión por Zona:** El cliente envía su Geohash (completo o truncado para mayor privacidad) para recibir la lista de peers activos en el área y establecer conexiones WebRTC directas.
*   **Sin Rastreo de Personas:** El tracker no registra usuarios ni los clientes muestran posiciones de otros peers en tiempo real en el mapa; la única presencia visible y persistente en el mundo son los propios graffitis.

---

## 8. Hilos de Conversación Espacial (Message Threads)
*   **Vínculo al Padre (`parent_signature`):** Para responder a un graffiti, el nuevo mensaje incluye en su cabecera la firma Ed25519 del mensaje original.
*   **Conversaciones Itinerantes:** Cada respuesta se ancla en las coordenadas donde se encuentra el autor al momento de responder, permitiendo que un hilo trace un recorrido físico y temporal a lo largo del mapa.
*   **Reconstrucción Descentralizada:** El cliente une los mensajes y reconstruye el árbol de la conversación localmente a partir de las firmas criptográficas. Si un nodo no posee el mensaje padre en su almacenamiento local, puede solicitarlo de forma prioritaria a los peers utilizando los protocolos de sincronización.
