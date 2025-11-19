import type { User } from "../utils/auth";

declare module "socket.io" {
  interface Socket {
    user?: User;
  }
}

export type JoinEvent = {
  code: string
}

export type AnswerEvent = {
  answer: string
}

