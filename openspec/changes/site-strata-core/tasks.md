# Tasks: Strata Prototype (Python)

## Fase 1: El Núcleo del Metabolismo (Local)
- [ ] **Modelado de Mensajes:** Crear la clase `Message` con firma criptográfica y metadatos.
- [ ] **Gestor de Estratos (`EpochManager`):** Implementar la lógica de encadenamiento de Merkle (cada bloque de mensajes apunta al hash del anterior).
- [ ] **Almacenamiento Local:** Implementar una caché simple que simule la "mochila" del usuario (SQLite o JSON).

## Fase 2: El Enjambre (Networking)
- [ ] **Simulador de Nodos:** Crear un script que levante múltiples instancias de `StrataNode` usando `asyncio`.
- [ ] **Protocolo de Gossip:** Implementar el intercambio de mensajes entre nodos cercanos (simulando Bluetooth/LAN).
- [ ] **Sincronización de Estratos:** Lógica para que un nodo nuevo descargue el historial "excavando" hacia atrás en el DAG.

## Fase 3: Ciudadanía e Ideas
- [ ] **Módulo de Identidad:** Generación de claves de lugar y "atestaciones de presencia" (firmas ciegas).
- [ ] **Anclaje de Ideas:** Lógica para etiquetar mensajes con conceptos y validar el derecho a hacerlo mediante el historial de presencia.
- [ ] **El "Dial del Tiempo":** CLI o interfaz simple para saltar entre diferentes épocas (hashes) del historial.

## Fase 4: Validación y Estrés
- [ ] **Prueba de "Olvido Orgánico":** Simular qué pasa cuando todos los nodos dejan de seeder un estrato antiguo.
- [ ] **Validación de Posts Remotos:** Implementar el desafío-respuesta para ciudadanos eternos que no están presentes.
