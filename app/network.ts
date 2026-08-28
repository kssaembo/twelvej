"use client";
import type { DataConnection, Peer as PeerType } from "peerjs";
export type NetMessage = { type: string; [key: string]: unknown };
export const peerId = (code: string) => `twelve-class-${code}`;
export async function createHost(
  code: string,
  onConnection: (c: DataConnection) => void,
  onState: (s: string) => void,
) {
  const { default: Peer } = await import("peerjs");
  const peer: PeerType = new Peer(peerId(code));
  peer.on("open", () => onState("online"));
  peer.on("connection", onConnection);
  peer.on("error", (e) => onState(e.type));
  return peer;
}
export async function connectArena(
  code: string,
  onData: (d: NetMessage) => void,
  onState: (s: string) => void,
) {
  const { default: Peer } = await import("peerjs");
  const peer: PeerType = new Peer();
  let conn: DataConnection | null = null;
  let heartbeat: number | undefined;
  let stopped = false;
  const connect = () => {
    if (stopped || peer.destroyed) return;
    conn = peer.connect(peerId(code), { reliable: true });
    conn.on("open", () => {
      onState("online");
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = window.setInterval(
        () => conn?.open && conn.send({ type: "HEARTBEAT", at: Date.now() }),
        10000,
      );
    });
    conn.on("data", (d) => onData(d as NetMessage));
    conn.on("close", () => {
      if (stopped) return;
      onState("reconnecting");
      if (heartbeat) clearInterval(heartbeat);
      setTimeout(connect, 2500);
    });
  };
  peer.on("open", connect);
  peer.on("error", () => onState("reconnecting"));
  return {
    peer,
    get connection() {
      return conn;
    },
    send: (d: NetMessage) => conn?.open && conn.send(d),
    destroy: () => {
      stopped = true;
      if (heartbeat) clearInterval(heartbeat);
      conn?.close();
      peer.destroy();
    },
  };
}
