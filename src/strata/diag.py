import time
import sys
import logging
import libtorrent as lt
from strata.core.engine import StrataEngine
from strata.core.geo import get_geohash, get_epoch_string, generate_info_hash

# Silenciar logs ruidosos para el diagnóstico
logging.getLogger("strata").setLevel(logging.WARNING)

def run_diagnostics(lat=40.41, lon=-3.70):
    print("\n--- 🕵️ DIAGNÓSTICO DE RED STRATA ---")
    
    engine = StrataEngine()
    geohash = get_geohash(lat, lon, 7)
    epoch = get_epoch_string()
    info_hash = generate_info_hash(geohash, epoch)
    
    print(f"📍 Ubicación: {geohash}")
    print(f"📦 InfoHash: {info_hash}")
    print(f"👤 Tu PK: {engine.identity.get_public_key_hex()[:16]}...")
    
    print("\nBuscando enjambre (swarm) en BitTorrent...")
    
    # Creamos una sesión temporal para el diagnóstico
    ses = lt.session()
    ses.listen_on(6881, 6891)
    
    # Configurar DHT para descubrimiento global
    ses.add_dht_router("router.bittorrent.com", 6881)
    ses.add_dht_router("router.utorrent.com", 6881)
    ses.add_dht_router("dht.transmissionbt.com", 6881)
    ses.start_dht()
    
    params = {
        'save_path': './storage',
        'info_hash': bytes.fromhex(info_hash),
    }
    handle = ses.add_torrent(params)
    
    print("⏳ Monitoreando conexiones (espera 15s)...")
    
    try:
        for _ in range(15):
            s = handle.status()
            peers = handle.get_peer_info()
            
            sys.stdout.write(f"\r👥 Pares conectados: {s.num_peers} | ⬇️  {s.download_rate/1000:.1f} kB/s | ⬆️  {s.upload_rate/1000:.1f} kB/s")
            sys.stdout.flush()
            
            if s.num_peers > 0:
                print(f"\n✅ ¡CONEXIÓN DETECTADA!")
                for p in peers:
                    print(f"   - Peer: {p.ip[0]}:{p.ip[1]} (Client: {p.client})")
            
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nDiagnóstico interrumpido.")
    
    print("\n\n--- Resumen ---")
    if handle.status().num_peers == 0:
        print("❌ No se detectaron pares. Verifica:")
        print("   1. ¿Hay otros dispositivos corriendo 'uv run strata node' en la misma lat/lon?")
        print("   2. ¿El firewall permite tráfico en el puerto 6881?")
        print("   3. ¿Has esperado lo suficiente para el descubrimiento vía DHT?")
    else:
        print("🎉 Red P2P activa y saludable.")

if __name__ == "__main__":
    run_diagnostics()
