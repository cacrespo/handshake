# Protocolo Handshake: Especificación del Sistema Espacio-Temporal P2P

**Versión:** `v0.1.0-draft` (Trabajo en Progreso)

> [!WARNING]
> Este documento representa un borrador activo del protocolo Handshake. La especificación no es definitiva y se encuentra en proceso de diseño y refinamiento, por lo que está sujeta a cambios estructurales importantes.

Este documento define la especificación técnica oficial del protocolo **Handshake** para asegurar la interoperabilidad entre diferentes implementaciones de nodos (como el cliente de escritorio en Python y el cliente Web en TypeScript).

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
    *   **Clave Privada (SK):** Instrumento local para firmar digitalmente los graffitis emitidos. Se mantiene estrictamente en el almacenamiento del cliente.
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
*   **Exención de Filtros para Mensajes Locales:** Los graffitis almacenados en la carpeta local de seedeo (o en el almacenamiento local en memoria) de un cliente **quedan exentos de los filtros espacio-temporal generales** (filtros de distancia en el mapa y del control deslizante del tiempo). Esto asegura que la memoria sembrada o custodiada localmente por el nodo siempre sea visible en su interfaz, previniendo la desaparición de mensajes locales legítimos cuando se regenera la identidad del usuario (cambio de clave pública).
*   **Escritura Automática e Inmediata en Disco:** Cuando un usuario crea un nuevo graffiti en el cliente, si existe una carpeta de seedeo local activa y configurada, el archivo `.msg` se guarda inmediatamente en el disco dentro de la carpeta del InfoHash espacial y temporal correspondiente, garantizando su persistencia y disponibilidad inmediata para la red P2P.

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
1.  **Modo Preciso (Opción A):** El cliente envía su Geohash completo de precisión 7 (ej. `"dr5reg6"`). Esto permite que el tracker lo empareje de forma exacta para el establecimiento optimizado de las conexiones WebRTC. *Nota de Privacidad:* Para prevenir el rastreo físico de personas, los clientes nunca renderizan en el mapa ni localizan visualmente las posiciones de otros peers; la interacción y descubrimiento social se realiza exclusivamente a través del intercambio y lectura de los graffitis.
2.  **Modo Ofuscado (Opción C):** El cliente decide preservar su privacidad y envía al tracker únicamente los primeros 5 caracteres de su Geohash (ej. `"dr5re"`). El tracker lo emparejará con los peers del área general (zona de ~5km) para permitir el establecimiento de la conexión WebRTC, pero los vecinos en el enjambre solo sabrán de manera implícita su presencia general en la vecindad para posibilitar el emparejamiento, sin mostrar jamás rastros ni coordenadas de posicionamiento físico individual.

---

## 8. Hilos de Conversación Espacial (Message Threads)
Para permitir discusiones e interacciones encadenadas, el protocolo implementa un modelo de **respuestas anidadas (estructura en árbol)**:
*   **Vínculo al Padre (`parent_signature`):** Cualquier graffiti que constituya una respuesta a un mensaje existente debe incluir en su cabecera el campo `"parent_signature"` conteniendo la firma Ed25519 exacta del mensaje padre al que replica.
*   **Independencia Espacial:** El mensaje de respuesta se ancla a la coordenada geográfica y temporal donde el autor de la respuesta se encuentra físicamente al momento de escribir (su propio Geohash y época). Esto permite que una conversación se mueva físicamente a lo largo de celdas adyacentes o trayectos.
*   **Reconstrucción del Hilo:** Los clientes cargan todos los graffitis de las celdas visibles o sincronizadas y reconstruyen localmente el árbol de la conversación emparejando cada mensaje con su correspondiente padre a través de su firma criptográfica. Si un nodo no posee el mensaje padre en su almacenamiento local, puede solicitarlo de forma prioritaria a los peers utilizando los protocolos de sincronización.
