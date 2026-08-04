# Protocolo Handshake: Especificación del Sistema Espacio-Temporal P2P

**Versión:** `v0.1.0-draft` (Trabajo en Progreso)

> [!WARNING]
> Este documento representa un borrador activo del protocolo Handshake. La especificación no es definitiva y se encuentra en proceso de diseño y refinamiento, por lo que está sujeta a cambios estructurales importantes.

Este documento define la especificación técnica oficial del protocolo **Handshake** para asegurar la interoperabilidad entre diferentes implementaciones de nodos (como el cliente de escritorio en Python y el cliente Web en TypeScript).

---

## Principio y Fundamento

### 1. La Visión
El auge de inteligencias artificiales capaces de imitar el comportamiento humano a la perfección diluye la línea entre lo real y lo sintético en el plano virtual. Ante la imposibilidad técnica de certificar la humanidad de una entidad digital de forma puramente abstracta en la web, Handshake propone una resistencia: **mantener los cuerpos en el mundo físico para validar y confirmar el mundo virtual**.

En lugar de aislar a los individuos en "islas virtuales" gobernadas por algoritmos de optimización de atención y feeds infinitos, este protocolo utiliza el espacio físico y el tiempo real como el paisaje de validación. La información no viaja sin control hacia el usuario; el usuario debe explorar activamente el espacio y el tiempo para descubrir las huellas digitales.

### 2. Intenciones y Filosofía del Protocolo
*   **La Geografía como el Algoritmo:** No existen sistemas centralizados de recomendación ni ordenamientos sesgados. El único filtro de visibilidad y relevancia de un mensaje es la distancia física, el momento temporal y las relaciones orgánicas de confianza de quien lo lee.
*   **Comunidades de Proximidad:** Romper la plaza pública global para retornar al intercambio a escala humana. Los usuarios interactúan y se comunican desde y dentro de sus vecindarios y trayectos cotidianos. Las ideas residen en los lugares físicos donde la gente realmente se reúne a conversar.
*   **Economía de la Atención e Intencionalidad:** Incentivar un registro digital deliberado, artesanal y consciente, priorizando la relevancia de la comunicación y el contexto local sobre la saturación constante de información.
*   **Soberanía de Datos Colectiva:** La infraestructura de almacenamiento y distribución es colectiva e independiente de silos corporativos. Cada nodo decide qué subconjunto de la memoria geográfica desea sembrar y preservar localmente en su disco, actuando como un custodio de la memoria histórica de su entorno.

---


## 1. Identidad Criptográfica
Cada usuario (peer) posee un par de claves asimétricas basadas en **Ed25519**:
*   **Clave Privada (SK):** Utilizada para firmar digitalmente los mensajes creados. Debe mantenerse secreta.
*   **Clave Pública (PK):** Utilizada como la identidad pública del usuario (`author_pk`) para verificar la autenticidad de sus mensajes.

### Formato de Portabilidad de Identidad (`.key`):
Para permitir la importación y exportación de identidades entre clientes Web y de escritorio, el archivo JSON generado debe seguir estrictamente la nomenclatura *snake_case*:
```json
{
  "public_key": "clave_publica_en_hexadecimal_64_caracteres",
  "private_key": "clave_privada_en_hexadecimal_64_o_128_caracteres"
}
```

---

## 2. Estructura del Mensaje (Schema)
Todos los graffitis en la red se representan y se transmiten utilizando el formato de serialización JSON. El esquema consta de tres bloques principales: `header`, `location` y `content`.

```json
{
  "version": "1.0",
  "header": {
    "type": "PUBLIC",
    "owner_pk": null,
    "author_pk": "hex_public_key_32_bytes",
    "parent_signature": "hex_parent_signature_64_bytes_optional",
    "timestamp": 1712345678,
    "signature": "hex_signature_64_bytes"
  },
  "location": {
    "geohash": "dr5reg6",
    "proof": {
      "type": "GPS",
      "data": "40.712776,-74.005974"
    }
  },
  "content": {
    "text": "Contenido del graffiti",
    "attachments": [
      {
        "url": "https://example.com/imagen.jpg",
        "sha256": "hash_sha256_hexadecimal_de_64_caracteres",
        "mime_type": "image/jpeg"
      }
    ]
  }
}
```

### Campos:
*   `header.type`: Tipo de mensaje (`PUBLIC` para libre acceso en texto plano o `ANCHORED` para mensajes privados cifrados dirigidos a un destinatario específico).
*   `header.owner_pk`: Clave pública (en formato hexadecimal de 32 bytes) del destinatario o propietario. Obligatorio si el tipo es `ANCHORED`, nulo si es `PUBLIC`.
*   `header.author_pk`: Clave pública (en formato hexadecimal) del autor del graffiti.
*   `header.parent_signature` (Opcional): Firma Ed25519 (string hexadecimal de 128 caracteres) del graffiti padre al que responde este mensaje. Nulo si el mensaje inicia un nuevo hilo.
*   `header.timestamp`: Marca de tiempo UNIX (segundos).
*   `header.signature`: Firma Ed25519 del objeto serializado en representación canónica (hexadecimal).

### Mensajes Anclados (`ANCHORED`) y Cifrado E2EE:
Cuando el tipo de mensaje se define como `ANCHORED`:
1.  **Cifrado de Extremo a Extremo (E2EE):** El texto contenido en `content.text` debe ser cifrado utilizando un esquema de clave pública/privada (como el cifrado autenticado de caja sellada, convirtiendo las llaves de firma Ed25519 a llaves de cifrado X25519).
2.  **Distribución Ciega:** Los nodos del enjambre descargarán, almacenarán y seedearán el archivo del mensaje de forma normal como cualquier otro graffiti. Sin embargo, el contenido textual en `content.text` será ilegible para los transportadores. Solo el nodo que posea la clave privada correspondiente al `header.owner_pk` podrá descifrar y renderizar el mensaje en pantalla.
*   `location.geohash`: Geohash que define la zona geográfica donde se ancla el mensaje.
*   `location.proof`: Tipo de prueba de localización (`NONE`, `GPS`, `BLE`) y sus datos adicionales.
*   `content.text`: Contenido textual del mensaje.
*   `content.attachments` (Opcional): Lista de archivos multimedia adjuntos. Cada elemento contiene:
    *   `url`: Dirección de descarga del archivo (HTTP, IPFS, Magnet Link).
    *   `sha256`: Hash SHA-256 del archivo para verificación de integridad (obligatorio).
    *   `mime_type`: Tipo de contenido del archivo (ej. `image/png`, `audio/ogg`, `video/mp4`).

### Serialización Canónica para la Firma:
Para generar o verificar la firma, se toma el JSON del mensaje **excluyendo el campo `header.signature`**, y se ordena de forma recursiva por sus claves (`sort_keys=True` en Python / ordenamiento alfabético en JS). El texto resultante se codifica en UTF-8 antes de firmar.

### Extensibilidad y Compatibilidad Futura:
Para garantizar que el protocolo pueda evolucionar sin romper la compatibilidad entre clientes de diferentes versiones:
*   **Campos Desconocidos:** Si un cliente recibe un mensaje que contiene campos no definidos en su versión local del protocolo, debe ignorar dichos campos para el procesamiento o renderizado visual local, pero **debe preservarlos intactos** en el archivo JSON original al guardarlo en el disco y al retransmitirlo a otros peers.
*   **Impacto en la Firma:** Al calcular la serialización canónica para verificar la firma, todos los campos (incluidos los desconocidos) deben ser incluidos y ordenados de forma recursiva. Eliminar o alterar cualquier campo desconocido invalidará la firma criptográfica Ed25519 del mensaje original.

---

## 3. Agrupación en Enjambres (Swarm Grouping)
Los graffitis no se distribuyen ni se "seedean" de forma individual para evitar la saturación de conexiones. En su lugar, se agrupan en **directorios espaciales y temporales**:

1.  **Resolución Espacial:** El mapa se divide en celdas usando **Geohash de precisión 7** (aprox. 150m x 150m).
2.  **Resolución Temporal:** El tiempo se agrupa en **épocas mensuales** en formato `YYYY-MM`.
3.  **Generación de InfoHash:** Se genera un identificador único SHA-1 determinista a partir del geohash y la época:
    $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$
4.  **Sedeo:** El enjambre de BitTorrent (o los canales WebRTC asociados) intercambia el directorio completo asociado a dicho `InfoHash`. Cada archivo dentro del directorio representa un mensaje individual nombrado de la forma:
    `{timestamp}_{author_pk_prefix}.msg`
5.  **Política de Sedeo Histórico:** Los nodos no limitan su actividad de sembrado únicamente al mes en curso. Un nodo sembrará activamente tanto la época actual como todas las épocas pasadas (meses anteriores) que posea almacenadas localmente para sus celdas geográficas de interés, actuando como un custodio histórico del lugar, siempre y cuando no se superen los límites globales de almacenamiento impuestos por su metabolismo local.

---

## 4. Reglas de Visibilidad y Confianza (El Handshake)
*   **Acceso Público y Abierto:** Cualquier usuario que consulte o descargue el enjambre correspondiente a un Geohash y una época determinada tendrá acceso visual a todos los graffitis públicos dentro de esa celda, sin limitaciones de distancia respecto a su posición en el mapa.
*   **El Rol de la Confianza (Handshake):**
    1.  **Prioridad y Prominencia Visual:** Los graffitis cuyos autores figuren en la lista de confianza criptográfica del usuario (nodos con los que se ha realizado un Handshake) se mostrarán de forma destacada y prioritaria en la interfaz de usuario para diferenciarlos del flujo general.
    2.  **Sedeo Automático y Preservación:** Los nodos descargarán y sembrarán (seedearán) prioritariamente los graffitis creados por personas de su red de confianza. Estos mensajes reciben el trato de archivos protegidos (exentos del metabolismo de limpieza).
*   **Limpieza (Metabolismo de Almacenamiento):** Cada enjambre local mantiene un límite (ej. 100 mensajes). Cuando se alcanza el límite, el nodo purga automáticamente los mensajes de autores desconocidos más antiguos para liberar espacio. Los mensajes de contactos de confianza (con Handshake verificado) quedan protegidos y nunca son eliminados automáticamente.

---

## 5. Descubrimiento Social de Enjambres (Social Discovery)
Para maximizar la resiliencia y la propagación de los graffitis en la red P2P, los nodos implementan un modelo de **Descubrimiento Social Abierto**:
*   **Intercambio de Relays:** Al conectarse con cualquier peer (sea a través de UDP en el cliente de escritorio o WebRTC en el cliente Web), los nodos anuncian de forma abierta la lista completa de `relays` (los InfoHashes de las celdas geográficas que están sembrando activamente en su almacenamiento local).
*   **Sedeo por Confianza Solidaria:** Cuando un nodo detecta que un peer verificado de su lista de contactos (Handshake) está sembrando determinados enjambres distantes, el nodo local se une automáticamente a dichos enjambres para actuar como sembrador (seeder) de respaldo, incluso si el nodo local no se encuentra físicamente en esas ubicaciones.

---

## 6. Validación de Ubicación y Pruebas de Co-presencia
El protocolo define un enfoque flexible para el anclaje físico y temporal de la información:
*   **Carácter Declarativo:** La ubicación geográfica (Geohash y coordenadas específicas) y la marca de tiempo (timestamp) de un graffiti son **declarativas e intencionales**. El autor decide soberanamente en qué punto del espacio-tiempo desea plasmar su mensaje, equiparándose a la acción física y artística de pintar una pared real.
*   **Prueba de Co-presencia (Opcional):** Como capa de veracidad física añadida, el emisor puede incluir una prueba de co-presencia en el campo `location.proof` con la siguiente estructura:
    *   `proof.type`: `"CO-PRESENCE"`
    *   `proof.data`: Un sub-objeto JSON que contiene la firma criptográfica Ed25519 de uno o más peers testigos (claves públicas vecinas descubiertas localmente vía Bluetooth/BLE o WebRTC en el mismo instante y zona).
*   **Validación y Visualización:** Los clientes de lectura aceptan todos los graffitis válidos, pero las interfaces de usuario (como el mapa) pueden destacar con marcas visuales distintivas (por ejemplo, "Verificado por Vecinos") a aquellos graffitis que incorporen pruebas de co-presencia verificables.

---

## 7. Protocolo del Tracker y Ofuscación de Ubicación (Signaling)
El tracker (o servidor de señalización) actúa únicamente como facilitador para conectar peers geográficamente cercanos. Para mitigar riesgos de rastreo de ubicación, los clientes disponen de dos modalidades de registro:
1.  **Modo Preciso (Opción A):** El cliente envía su Geohash completo de precisión 7 (ej. `"dr5reg6"`). Esto permite que el tracker lo empareje de forma exacta y que sus vecinos puedan ver y renderizar su posición precisa en la grilla del mapa.
2.  **Modo Ofuscado (Opción C):** El cliente decide preservar su privacidad y envía al tracker únicamente los primeros 5 caracteres de su Geohash (ej. `"dr5re"`). El tracker lo emparejará con los peers del área general (zona de ~5km) para permitir el establecimiento de la conexión WebRTC, pero los vecinos en el enjambre solo sabrán que está presente en la vecindad general, sin conocer su ubicación exacta.

---

## 8. Hilos de Conversación Espacial (Message Threads)
Para permitir discusiones e interacciones encadenadas, el protocolo implementa un modelo de **respuestas anidadas (estructura en árbol)**:
*   **Vínculo al Padre (`parent_signature`):** Cualquier graffiti que constituya una respuesta a un mensaje existente debe incluir en su cabecera el campo `"parent_signature"` conteniendo la firma Ed25519 exacta del mensaje padre al que replica.
*   **Independencia Espacial:** El mensaje de respuesta se ancla a la coordenada geográfica y temporal donde el autor de la respuesta se encuentra físicamente al momento de escribir (su propio Geohash y época). Esto permite que una conversación se mueva físicamente a lo largo de celdas adyacentes o trayectos.
*   **Reconstrucción del Hilo:** Los clientes cargan todos los graffitis de las celdas visibles o sincronizadas y reconstruyen localmente el árbol de la conversación emparejando cada mensaje con su correspondiente padre a través de su firma criptográfica. Si un nodo no posee el mensaje padre en su almacenamiento local, puede solicitarlo de forma prioritaria a los peers utilizando los protocolos de sincronización.
