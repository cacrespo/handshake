# Protocolo Handshake: EspecificaciÃ³n del Sistema Espacio-Temporal P2P

**VersiÃ³n:** `v0.1.0-draft` (Trabajo en Progreso)

> [!WARNING]
> Este documento representa un borrador activo del protocolo Handshake. La especificaciÃ³n no es definitiva y se encuentra en proceso de diseÃ±o y refinamiento, por lo que estÃ¡ sujeta a cambios estructurales importantes.

Este documento define la especificaciÃ³n tÃ©cnica oficial del protocolo **Handshake** para asegurar la interoperabilidad entre diferentes implementaciones de nodos (como el cliente de escritorio en Python y el cliente Web en TypeScript).

---

## Principio y Fundamento

### 1. La VisiÃ³n
La mayorÃ­a de las redes tradicionales estÃ¡n centradas en la identidad abstracta: perfiles, cuentas, seguidores y mÃ©tricas de reputaciÃ³n digital. En un entorno donde distinguir entre humanos, bots o identidades sintÃ©ticas es irrelevante o imposible en el plano virtual, **Handshake desplaza el centro de gravedad desde las personas hacia los mensajes**.

La red no busca gestionar ni validar perfiles virtuales. En su lugar, el sistema es una trama viva de **mensajes y graffitis anclados en coordenadas exactas de espacio y tiempo**.

La validaciÃ³n de lo humano no ocurre mediante algoritmos de verificaciÃ³n digital, sino a travÃ©s del **encuentro fÃ­sico real**. El protocolo empuja hacia la presencia y la proximidad fÃ­sica, pero en el plano virtual la unidad fundamental es siempre la huella (el mensaje), no la cuenta ni la persona.

### 2. Intenciones y FilosofÃ­a del Protocolo
*   **El Mensaje como Unidad Soberana:** No existen muros personales, cuentas infladas ni feeds de usuarios. Hay graffitis en el espacio-tiempo. Un mensaje vale y existe por su ubicaciÃ³n, su contenido y el interÃ©s colectivo en preservarlo.
*   **La GeografÃ­a y el Tiempo como el Algoritmo:** La visibilidad y el descubrimiento dependen de la geografÃ­a y el momento temporal. No existen algoritmos de atenciÃ³n ni optimizaciÃ³n de engagement: para encontrar una huella digital, debes explorar esas coordenadas.
*   **Custodia y Seeding Colectivo (SoberanÃ­a de Datos):** La red no depende de un servidor central propietario. Cualquier persona puede seedear mensajes, decidiendo libremente quÃ© partes de la memoria espacial desea conservar, replicar o descartar en su propio almacenamiento local, actuando como custodio de la memoria histÃ³rica de su entorno.
*   **Puente hacia el Encuentro FÃ­sico:** Aunque la red virtual almacena e intercambia mensajes sin importar el origen abstracto del autor, el protocolo incentiva y celebra el encuentro en el mundo real como el Ãºnico espacio genuino de validaciÃ³n y conexiÃ³n humana.

---


## 1. Identidad CriptogrÃ¡fica

El protocolo no implementa conceptos de "cuentas de usuario", "registros" ni "perfiles". La identidad en Handshake es puramente criptogrÃ¡fica, descentralizada y orientada a la firma de mensajes:

*   **Pares de Claves Ed25519:** Cada nodo o emisor utiliza un par de claves asimÃ©tricas Ed25519:
    *   **Clave Privada (SK):** Instrumento local para firmar digitalmente los graffitis emitidos. Se mantiene estrictamente en el almacenamiento del cliente.
    *   **Clave PÃºblica (PK):** Identificador del autor (`author_pk`) utilizado por el enjambre P2P para verificar la integridad y autenticidad del mensaje y certificar que no fue alterado durante el transporte.
*   **Pseudonimato Opcional:** Un usuario puede reutilizar su par de claves para mantener consistencia como autor o generar claves efÃ­meras para emitir mensajes puntuales. El protocolo no vincula nombres, correos ni datos personales a ninguna clave.

### Formato de Portabilidad de Identidad (`.key`):
Para permitir la importaciÃ³n y exportaciÃ³n soberana de llaves entre clientes (Web, CLI, mÃ³vil) sin depender de servidores:
```json
{
  "public_key": "clave_publica_en_hexadecimal_64_caracteres",
  "private_key": "clave_privada_en_hexadecimal_64_o_128_caracteres"
}
```

---

## 2. Estructura del Mensaje (Schema)

Todos los graffitis en la red son pÃºblicos, abiertos e inmutables. Se representan y transmiten utilizando serializaciÃ³n JSON estricta. El esquema consta de tres bloques principales: `header`, `location` y `content`.

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
*   `header.author_pk`: Clave pÃºblica Ed25519 (string hexadecimal de 64 caracteres / 32 bytes) del autor que firmÃ³ el graffiti.
*   `header.parent_signature` (Opcional): Firma Ed25519 del graffiti padre al que responde este mensaje (`null` si inicia una nueva conversaciÃ³n o huella independiente). Permite formar Ã¡rboles y grafos de conversaciÃ³n espaciales.
*   `header.timestamp`: Marca de tiempo UNIX (en segundos) en la que fue emitido el graffiti.
*   `header.signature`: Firma digital Ed25519 del objeto serializado en formato canÃ³nico (excluyendo este mismo campo).
*   `location.geohash`: Geohash estÃ¡ndar (longitud configurable, tÃ­picamente 5-7 caracteres) utilizado para indexar y descubrir enjambres espaciales de peers en el Ã¡rea.
*   `location.coordinates`: Coordenadas geogrÃ¡ficas exactas de alta precisiÃ³n (`lat`, `lon`) para su renderizado en el mapa.
*   `content.text`: Contenido textual del mensaje (obligatorio, texto plano o markdown simple).
*   `content.attachments` (Opcional): Lista de archivos multimedia vinculados. Cada elemento incluye `url` de descarga, `sha256` para verificaciÃ³n criptogrÃ¡fica de integridad y `mime_type`.

### SerializaciÃ³n CanÃ³nica para la Firma:
Para generar o verificar la firma Ed25519:
1. Se toma el JSON del mensaje **excluyendo el campo `header.signature`**.
2. Se ordenan de forma recursiva todas sus claves alfabÃ©ticamente (`sort_keys=True` en Python / ordenamiento alfabÃ©tico de propiedades de objeto en TypeScript).
3. Se genera la cadena JSON normalizada sin espacios superfluos, se codifica en UTF-8 y se firma/verifica con la clave Ed25519.

### Extensibilidad y PreservaciÃ³n de Datos:
*   **Campos Desconocidos:** Si un cliente recibe un mensaje que contiene campos adicionales no contemplados en su versiÃ³n, debe ignorarlos para el renderizado local, pero **debe preservarlos intactos** en el archivo JSON almacenado en disco y al retransmitirlo al enjambre P2P.
*   **Inmutabilidad de la Firma:** Modificar, omitir o reordenar cualquier campo invalidarÃ## 3. AgrupaciÃ³n en Enjambres (Swarm Grouping)
Los graffitis no se transmiten de forma aislada, sino agrupados en **directorios espaciales y temporales**:

1.  **ResoluciÃ³n Espacial:** El territorio se divide en celdas usando **Geohash de precisiÃ³n 6 o 7** (entre ~1.2 km y ~150 metros).
2.  **ResoluciÃ³n Temporal:** El tiempo se agrupa en **Ã©pocas mensuales** en formato `YYYY-MM`.
3.  **GeneraciÃ³n de InfoHash:** Se calcula un identificador determinista SHA-1 para el enjambre:
    $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$
4.  **Sedeo Colectivo:** Las conexiones (WebRTC en Web o P2P de escritorio) intercambian los mensajes pertenecientes a dicho `InfoHash`. Cada archivo se almacena localmente como:
    `{timestamp}_{author_pk_prefix}.msg`
5.  **Custodia HistÃ³rica:** Los nodos pueden sembrar tanto la Ã©poca actual como Ã©pocas pasadas custodiadas en su almacenamiento local, preservando la memoria histÃ³rica de su entorno geogrÃ¡fico.

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
*   **Sedeo Solidario:** Si un nodo detecta que un contacto de su lista de Handshakes custodia enjambres distantes, puede optar por actuar como sembrador de respaldo para apoyar la preservaciÃ³n de esas huellas.

---

## 6. Naturaleza Declarativa del Espacio-Tiempo
*   **CarÃ¡cter Declarativo:** La ubicaciÃ³n (`geohash` y coordenadas) y la estampa de tiempo (`timestamp`) de un graffiti son declarativas e intencionales: el autor decide plasmar su huella en esas coordenadas, anÃ¡logo a pintar un muro real en la ciudad.
*   **Prueba Opcional de Co-presencia:** Un graffiti puede incluir opcionalmente firmas de peers testigos en el Ã¡rea (`location.proof`) para certificar presencia simultÃ¡nea verificable.

---

## 7. Tracker y Privacidad Espacial (Signaling)
El tracker actÃºa exclusivamente como servidor de seÃ±alizaciÃ³n para conectar peers interesados en el mismo espacio-tiempo:
*   **ConexiÃ³n por Zona:** El cliente envÃ­a su Geohash (completo o truncado para mayor privacidad) para recibir la lista de peers activos en el Ã¡rea y establecer conexiones WebRTC directas.
*   **Sin Rastreo de Personas:** El tracker no registra usuarios ni los clientes muestran posiciones de otros peers en tiempo real en el mapa; la Ãºnica presencia visible y persistente en el mundo son los propios graffitis.

---

## 8. Hilos de ConversaciÃ³n Espacial (Message Threads)
*   **VÃ­nculo al Padre (`parent_signature`):** Para responder a un graffiti, el nuevo mensaje incluye en su cabecera la firma Ed25519 del mensaje original.
*   **Conversaciones Itinerantes:** Cada respuesta se ancla en las coordenadas donde se encuentra el autor al momento de responder, permitiendo que un hilo trace un recorrido fÃ­sico y temporal a lo largo del mapa.
*   **ReconstrucciÃ³n Descentralizada:** El cliente une los mensajes y reconstruye el Ã¡rbol de la conversaciÃ³n localmente a partir de las firmas criptogrÃ¡ficas.grÃ¡fica. Si un nodo no posee el mensaje padre en su almacenamiento local, puede solicitarlo de forma prioritaria a los peers utilizando los protocolos de sincronizaciÃ³n.
