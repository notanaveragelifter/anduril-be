import { Module } from '@nestjs/common';
import { MarketController } from './market.controller.js';
import { MarketService } from './market.service.js';
import { SupabaseService } from './supabase.service.js';

@Module({
    controllers: [MarketController],
    providers: [MarketService, SupabaseService],
})
export class MarketModule { }
