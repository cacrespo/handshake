# Design: Strata - Technical Architecture

## 1. Data Structure: The Chronological Merkle DAG
La memoria de un lugar se organiza en **Epochs** (Épocas).

- **Epoch (Estrato):** Un `InfoHash` que representa el estado de la pizarra en un periodo.
- **Chaining:** Cada Epoch referencia al hash del estrato anterior, permitiendo reconstruir la historia completa desde el presente hacia atrás.

## 2. Eternal Citizenship: Blinded Identity
Mecánica para postear remotamente manteniendo la privacidad:
- **Presence Attestation:** Un token firmado obtenido físicamente.
- **ZKP Proof:** Una prueba de conocimiento cero que valida el derecho a postear sin revelar la identidad ni el historial de visitas del autor.

## 3. Metabolism: Seeder-Driven Persistence
- **Survival:** Un mensaje existe mientras al menos una persona decida dedicar espacio en su dispositivo para seederlo.
- **Decay:** Los mensajes sin interés pierden seeders y se hunden en las "capas profundas" de la red, volviéndose más difíciles de encontrar pero permaneciendo grabados en la estructura del Merkle Tree.

## 4. The "Time Dial" Protocol
- Interfaz técnica para saltar entre hashes históricos y activar descargas de estratos antiguos bajo demanda.

## 5. Reference Implementation: Python
Se utilizará Python como lenguaje principal para el prototipo por su capacidad de modelado rápido de protocolos de red.

- **Asincronía:** `asyncio` para gestionar múltiples conexiones P2P concurrentes.
- **Networking:** `libp2p` o `socket` directo para el protocolo de chismes (gossip).
- **Criptografía:** `cryptography` para las firmas de ciudadanía y `pysnark` para las pruebas de conocimiento cero (ZKP).
