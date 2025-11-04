import type { User } from "../utils/auth";

declare module "socket.io" {
  interface Socket {
    user?: User;
  }
}
