import pytest
import os
import shutil
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.storage import StorageManager
from strata.core.models import Message

@pytest.fixture
def clean_storage():
    path = "./test_storage_threads"
    if os.path.exists(path):
        shutil.rmtree(path)
    yield path
    if os.path.exists(path):
        shutil.rmtree(path)

def test_message_thread_linking(clean_storage):
    storage = StorageManager(clean_storage)
    geohash = "dr5reg6"
    info_hash = "c368526f69c1da7bf7b68c75e60ec332985816c2"

    # 1. Crear e iniciar el Mensaje Padre (Raíz)
    priv_alice = ed25519.Ed25519PrivateKey.generate()
    msg_parent = Message(
        author_pk=priv_alice.public_key().public_bytes_raw(),
        geohash=geohash,
        content="Mensaje original de Alice",
    )
    msg_parent.sign(priv_alice)
    
    # Guardar en almacenamiento
    storage.save_message(info_hash, msg_parent)
    assert msg_parent.verify(), "La firma del mensaje raíz debe ser válida"
    assert msg_parent.parent_signature is None, "El mensaje raíz no debe tener padre"

    # 2. Bob responde al mensaje de Alice
    priv_bob = ed25519.Ed25519PrivateKey.generate()
    msg_reply = Message(
        author_pk=priv_bob.public_key().public_bytes_raw(),
        geohash=geohash,
        content="Respuesta de Bob a Alice",
        parent_signature=msg_parent.signature, # Apunta a la firma de Alice
    )
    msg_reply.sign(priv_bob)
    
    storage.save_message(info_hash, msg_reply)
    assert msg_reply.verify(), "La firma de la respuesta debe ser válida"
    assert msg_reply.parent_signature == msg_parent.signature, "La respuesta debe enlazarse a la firma del padre"

    # 3. Cargar desde disco y verificar la reconstrucción del hilo
    loaded_messages = storage.load_messages(info_hash)
    assert len(loaded_messages) == 2, "Deben cargarse dos mensajes de la celda"
    
    loaded_parent = next(m for m in loaded_messages if m.parent_signature is None)
    loaded_reply = next(m for m in loaded_messages if m.parent_signature is not None)

    assert loaded_parent.content == "Mensaje original de Alice"
    assert loaded_reply.content == "Respuesta de Bob a Alice"
    assert loaded_reply.parent_signature == loaded_parent.signature, "El enlace del hilo debe persistirse intacto tras cargarse"
