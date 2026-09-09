import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { IpRateLimiter } from "./rate-limit";

@Module({
  controllers: [ChatController],
  providers: [ChatService, IpRateLimiter],
})
export class AppModule {}
