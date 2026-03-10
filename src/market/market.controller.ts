import {
    Controller,
    Get,
    Param,
    Query,
    UseGuards,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { MarketService } from './market.service.js';
import { AuthGuard } from './auth.guard.js';

@Controller('market')
@UseGuards(AuthGuard)
export class MarketController {
    constructor(private readonly marketService: MarketService) { }

    // ─── Endpoint 1: GET /market/resolvable ───────────────────────────────
    @Get('resolvable')
    async getResolvable() {
        try {
            return await this.marketService.getResolvable();
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch resolvable markets',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 7: GET /market/resolvable/details ───────────────────────
    // (must be registered BEFORE dynamic :address routes)
    @Get('resolvable/details')
    async getResolvableDetails() {
        try {
            return await this.marketService.getResolvableDetails();
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch resolvable market details',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 2: GET /market/settled ──────────────────────────────────
    @Get('settled')
    async getSettled(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
            const l = Math.max(1, parseInt(limit ?? '100', 10) || 100);
            return await this.marketService.getSettled(p, l);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch settled markets',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 6: GET /market/settled/details ──────────────────────────
    // (must be registered BEFORE dynamic :address routes)
    @Get('settled/details')
    async getSettledDetails(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
            const l = Math.max(1, parseInt(limit ?? '20', 10) || 20);
            return await this.marketService.getSettledDetails(p, l);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch settled market details',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 5: GET /market/settlementData/:address ──────────────────
    @Get('settlementData/:address')
    async getSettlementData(@Param('address') address: string) {
        try {
            return await this.marketService.getSettlementData(address);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch settlement data',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 8: GET /market/stats ────────────────────────────────────
    @Get('stats')
    async getStats() {
        try {
            return await this.marketService.getStats();
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch market stats',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 4: GET /market/all/:address ─────────────────────────────
    @Get('all/:address')
    async getMarketByAddress(@Param('address') address: string) {
        try {
            return await this.marketService.getMarketByAddress(address);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch market',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // ─── Endpoint 3: GET /market ──────────────────────────────────────────
    // (root path — registered last to avoid conflicts with sub-routes)
    @Get()
    async getAllMarkets(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
            const l = Math.max(1, parseInt(limit ?? '100', 10) || 100);
            return await this.marketService.getAllMarkets(p, l);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException(
                'Failed to fetch markets',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
