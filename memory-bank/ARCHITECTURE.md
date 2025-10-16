# Architecture

```mermaid
flowchart LR
    subgraph Client[Browsers]
        H1[Host A] --- H2[Host B]
        C1[Caller 1] --- C2[Caller 2] --- Cn[Caller Y]
    end

    subgraph Signaling
        WS[WebSocket Signaling Server]
        TURN[coturn (STUN/TURN)]
    end

    subgraph Studio[OpenStudio Web App]
        MIX[Web Audio Graph<br/>Per‑participant gains/mutes<br/>Mix‑Minus buses]
        ENC[WebRTC Encoders (Opus)]
        OUT[Program Bus]
    end

    DIR[Distributed Station Directory (DHT/libp2p)]
    ICE[Icecast Server]

    H1 <---> WS
    H2 <---> WS
    C1 <---> WS
    C2 <---> WS
    Cn <---> WS
    WS <---> TURN

    H1 --> MIX
    H2 --> MIX
    C1 --> MIX
    C2 --> MIX
    Cn --> MIX

    MIX --> ENC --> OUT --> ICE

    StationOwner[Station Owner Node] <--> DIR
    WS <--> DIR
```

### Notes
- **Media** flows peer‑to‑peer where possible; TURN relays only when necessary.
- **Mix‑Minus** is computed in the host’s Web Audio graph and sent via individualized
  return feeds for callers.
- **Program Output** is a unicast WebRTC → local capture → encoder → Icecast mountpoint.
- **Directory** provides discovery only; stations self‑host their ws/signal endpoints.
