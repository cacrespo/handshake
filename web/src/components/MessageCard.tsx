import React from "react";
import {
  MapPin,
  Clock,
  Shield,
  CornerDownRight,
  Sparkles,
  MessageSquare,
  UserCheck,
  UserPlus,
  Download,
} from "lucide-react";
import { getMessageGeohash, getMessageTimestamp, decodeGeohash } from "../utils";
import { getDistance, categorizeTimestamp, timestampToEpoch } from "../storage/query";

export interface MessageCardProps {
  node: any;
  depth?: number;
  userCoords: [number, number];
  publicKey: string;
  trustedAuthors: string[];
  pinnedSignatures: Set<string>;
  activeGraffitiId: string | null;
  onSelectMessage: (msg: any) => void;
  onFocusRadar: (coords: [number, number], geohash: string, sig?: string) => void;
  onTogglePin: (sig: string) => void;
  onToggleTrust: (authorPk: string) => void;
  onReply: (parent: any) => void;
  onSaveAndSeed: (msg: any) => void;
  findParentSnippet?: (parentSig: string) => { author: string; text: string } | null;
}

export function getAuthorAvatar(pubkey: string) {
  if (!pubkey) return { bg: "#3b82f6", initials: "??", snippet: "anon" };
  let hash = 0;
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 50) % 360;
  const initials = pubkey.substring(0, 2).toUpperCase();
  const bg = `linear-gradient(135deg, hsl(${hue1}, 75%, 48%), hsl(${hue2}, 85%, 38%))`;
  return { bg, initials, snippet: pubkey.substring(0, 8) };
}

export const MessageCard: React.FC<MessageCardProps> = ({
  node,
  depth = 0,
  userCoords,
  publicKey,
  trustedAuthors,
  pinnedSignatures,
  activeGraffitiId,
  onSelectMessage,
  onFocusRadar,
  onTogglePin,
  onToggleTrust,
  onReply,
  onSaveAndSeed,
  findParentSnippet,
}) => {
  const sig = node.header?.signature || node.signature || "";
  const authorPk = node.header?.author_pk || node.author_pk || "";
  const isMine = authorPk === publicKey;
  const isTrusted = trustedAuthors.includes(authorPk);
  const isPinned = pinnedSignatures.has(sig) || node.is_pinned === 1;
  const isLocal = Boolean(node.is_local);
  const isActive = activeGraffitiId === sig;

  const nodeGh = getMessageGeohash(node);
  const nodeTs = getMessageTimestamp(node);
  const avatar = getAuthorAvatar(authorPk);

  let coords = { lat: 0, lon: 0 };
  let dist = 0;
  try {
    coords = decodeGeohash(nodeGh);
    dist = getDistance(userCoords[0], userCoords[1], coords.lat, coords.lon);
  } catch {
    // fallback
  }

  const category = categorizeTimestamp(nodeTs);
  const epoch = timestampToEpoch(nodeTs);
  const formattedDate = new Date(nodeTs * 1000).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  });

  const parentSig = node.header?.parent_signature ?? node.parent_signature;
  const parentSnippet = parentSig && findParentSnippet ? findParentSnippet(parentSig) : null;

  const replies = node.replies || [];

  return (
    <div
      className={`message-thread-node depth-${depth}`}
      style={{
        marginLeft: depth > 0 ? "24px" : "0",
        borderLeft: depth > 0 ? "2px solid rgba(0, 243, 255, 0.25)" : "none",
        paddingLeft: depth > 0 ? "14px" : "0",
        marginTop: depth > 0 ? "10px" : "16px",
      }}
    >
      <article
        className={`message-card ${isActive ? "active-selected" : ""} ${
          isTrusted ? "trusted" : isLocal ? "local" : "remote"
        }`}
        onClick={() => onSelectMessage(node)}
        data-testid={`message-card-${sig}`}
      >
        {/* Top Header */}
        <header className="card-top-bar">
          <div className="card-identity-cluster">
            <div className="avatar-identicon" style={{ background: avatar.bg }}>
              {avatar.initials}
            </div>
            <div className="author-meta-info">
              <div className="author-line">
                <span className="card-author-hash">#{avatar.snippet}</span>
                {isMine && <span className="author-self-tag">(Tú)</span>}
              </div>

              {/* Status and Verification Badges */}
              <div className="badge-row">
                <span
                  className="badge badge-verified"
                  title="Firma criptográfica Ed25519 verificada matemáticamente"
                >
                  <Shield size={10} className="badge-icon-verified" />
                  <span>Ed25519</span>
                </span>

                <span
                  className={`badge ${
                    isTrusted ? "badge-success" : isLocal ? "badge-info" : "badge-warning"
                  }`}
                >
                  {isTrusted ? "★ Confiable" : isLocal ? "● Local" : "⚡ P2P"}
                </span>

                {isPinned && (
                  <span className="badge badge-pinned" title="Graffiti fijado en almacenamiento persistente">
                    📌 Fijado
                  </span>
                )}

                <span
                  className={`badge badge-temporal-category ${category}`}
                  title={`Categoría temporal: ${category}`}
                >
                  <Clock size={10} />
                  {category === "present"
                    ? "En Vivo"
                    : category === "past"
                    ? "Archivo Histórico"
                    : "Cápsula Futura"}
                </span>
              </div>
            </div>
          </div>

          {/* Temporal and Spatial Quick Info */}
          <div className="card-time-spatial-chips">
            <button
              className="chip-spatial-btn"
              onClick={(e) => {
                e.stopPropagation();
                onFocusRadar([coords.lat, coords.lon], nodeGh, sig);
              }}
              title="Enfocar coordenadas en el radar espacial"
            >
              <MapPin size={11} className="chip-icon-cyan" />
              <span>{dist < 1000 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`}</span>
            </button>
            <time className="card-date-time" dateTime={new Date(nodeTs * 1000).toISOString()}>
              {formattedDate}
            </time>
          </div>
        </header>

        {/* Parent Reply Link / Tree Context */}
        {parentSig && (
          <div
            className="card-reply-context"
            onClick={(e) => {
              e.stopPropagation();
              onFocusRadar([coords.lat, coords.lon], nodeGh, parentSig);
            }}
            title="Haz clic para ver mensaje original"
          >
            <CornerDownRight size={12} className="reply-arrow-icon" />
            <span className="reply-label">En respuesta a</span>
            <code className="reply-hash">#{parentSig.substring(0, 8)}</code>
            {parentSnippet && (
              <span className="reply-preview-text">
                "{parentSnippet.text.substring(0, 40)}..."
              </span>
            )}
          </div>
        )}

        {/* Message Sovereign Content */}
        <div className="card-body-stream card-content">
          "{node.content?.text || ""}"
        </div>

        {/* Space-Time Anchor Footer & Actions */}
        <footer className="card-footer-triad">
          <div className="anchor-indicators">
            <span
              className="anchor-chip space"
              onClick={(e) => {
                e.stopPropagation();
                onFocusRadar([coords.lat, coords.lon], nodeGh, sig);
              }}
              title="Geohash de anclaje espacial. Clic para filtrar en radar."
            >
              <MapPin size={11} />
              <code>{nodeGh.substring(0, 7)}</code>
            </span>

            <span className="anchor-chip time" title={`Época de anclaje: ${epoch}`}>
              <Clock size={11} />
              <span>{epoch}</span>
            </span>
          </div>

          <div className="card-actions-bar">
            {/* Focus Radar */}
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onFocusRadar([coords.lat, coords.lon], nodeGh, sig);
              }}
              title="Enfocar en Radar Espacial"
            >
              <Sparkles size={12} />
              <span>Radar</span>
            </button>

            {/* Toggle Pin */}
            <button
              className={`action-btn ${isPinned ? "active-pin" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(sig);
              }}
              title={isPinned ? "Desfijar de almacenamiento" : "Fijar en memoria local"}
            >
              <span>{isPinned ? "📌 Fijado" : "📌 Fijar"}</span>
            </button>

            {/* Handshake Trust */}
            {!isMine && (
              <button
                className={`action-btn ${isTrusted ? "active-trusted" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTrust(authorPk);
                }}
                title={isTrusted ? "Desconfiar contacto" : "Confiar autor (Handshake)"}
              >
                {isTrusted ? <UserCheck size={12} /> : <UserPlus size={12} />}
                <span>{isTrusted ? "Confiable" : "Confiar"}</span>
              </button>
            )}

            {/* Seed / Persist */}
            {!isLocal && (
              <button
                className="action-btn btn-highlight"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveAndSeed(node);
                }}
                title="Guardar y seedear este graffiti en tu nodo"
              >
                <Download size={12} />
                <span>Seedear</span>
              </button>
            )}

            {/* Reply in Thread */}
            <button
              className="action-btn btn-reply"
              onClick={(e) => {
                e.stopPropagation();
                onReply(node);
              }}
              title="Responder a este graffiti en este hilo"
            >
              <MessageSquare size={12} />
              <span>Responder</span>
            </button>
          </div>
        </footer>
      </article>

      {/* Recursive Replies Tree */}
      {replies.length > 0 && (
        <div className="threaded-replies-list">
          {replies.map((replyNode: any, idx: number) => (
            <MessageCard
              key={`reply-${sig}-${idx}`}
              node={replyNode}
              depth={depth + 1}
              userCoords={userCoords}
              publicKey={publicKey}
              trustedAuthors={trustedAuthors}
              pinnedSignatures={pinnedSignatures}
              activeGraffitiId={activeGraffitiId}
              onSelectMessage={onSelectMessage}
              onFocusRadar={onFocusRadar}
              onTogglePin={onTogglePin}
              onToggleTrust={onToggleTrust}
              onReply={onReply}
              onSaveAndSeed={onSaveAndSeed}
              findParentSnippet={findParentSnippet}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageCard;
