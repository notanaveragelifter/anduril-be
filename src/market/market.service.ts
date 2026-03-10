import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service.js';

const BATCH_SIZE = 50;

/**
 * Fetch market_allData rows for a potentially large list of addresses.
 * Splits into batches of BATCH_SIZE to avoid URL-too-long errors.
 */
async function batchFetchMarkets(
    client: SupabaseClient,
    addresses: string[],
    columns: string,
): Promise<Record<string, any>[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        chunks.push(addresses.slice(i, i + BATCH_SIZE));
    }

    const results = await Promise.all(
        chunks.map((chunk) =>
            client
                .from('market_allData')
                .select(columns)
                .in('market', chunk),
        ),
    );

    const rows: Record<string, any>[] = [];
    for (const result of results) {
        if (result.error) throw new InternalServerErrorException(result.error.message);
        rows.push(...((result.data ?? []) as Record<string, any>[]));
    }
    return rows;
}


/**
 * Explicit column list for market_allData — NEVER includes question_embedding.
 */
const MARKET_ALL_DATA_COLUMNS = [
    'market',
    'creator',
    'question',
    'initial_liquidity',
    'market_reserves',
    'yes_token_supply',
    'no_token_supply',
    'end_time',
    'resolved',
    'yes_token_mint',
    'no_token_mint',
    'signature',
    'slot',
    'timestamp',
    'created_at',
    'updated_at',
    'category',
    'creator_fees',
    'type',
    'extra_data',
    'market_volume',
].join(',');

/**
 * Map a market_allData row to the API response shape.
 */
function mapMarketRow(row: Record<string, any> | null) {
    if (!row) return null;
    return {
        address: row.market,
        question: row.question,
        market_endTime: row.end_time,
        created_at: row.created_at,
        category: row.category,
        resolved: row.resolved,
        type: row.type,
        initial_liquidity: row.initial_liquidity,
        market_reserves: row.market_reserves,
        yes_token_supply: row.yes_token_supply,
        no_token_supply: row.no_token_supply,
        creator: row.creator,
        yes_token_mint: row.yes_token_mint,
        no_token_mint: row.no_token_mint,
    };
}

/**
 * Merge a mapped market row with oracle data.
 */
function mergeMarketAndOracle(
    marketRow: Record<string, any> | null,
    oracleRow: Record<string, any>,
    includeSettlementData = false,
): Record<string, any> {
    const base: Record<string, any> = marketRow
        ? { ...marketRow }
        : {
            address: oracleRow.market_address,
            question: oracleRow.question,
            market_endTime: oracleRow.market_endTime ?? null,
            created_at: null,
            category: null,
            resolved: null,
            type: oracleRow.type ?? null,
            initial_liquidity: null,
            market_reserves: null,
            yes_token_supply: null,
            no_token_supply: null,
            creator: null,
            yes_token_mint: null,
            no_token_mint: null,
        };

    base.settlement_criteria = oracleRow.settlement_criteria ?? null;

    if (includeSettlementData) {
        base.settlement_data = oracleRow.settlement_data ?? null;
    }

    return base;
}

@Injectable()
export class MarketService {
    constructor(private readonly supabaseService: SupabaseService) { }

    private get client() {
        return this.supabaseService.getClient();
    }

    // ─── Endpoint 1: GET /market/resolvable ───────────────────────────────
    async getResolvable(): Promise<string[]> {
        const { data, error } = await this.client
            .from('market_oracle_db')
            .select('market_address')
            .or('settlement_data.is.null,settlement_data.eq.{}');

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        return (data ?? []).map((row) => row.market_address);
    }

    // ─── Endpoint 2: GET /market/settled ──────────────────────────────────
    async getSettled(page: number, limit: number) {
        const offset = (page - 1) * limit;

        // Get total count
        const { count, error: countError } = await this.client
            .from('market_oracle_db')
            .select('id', { count: 'exact', head: true })
            .not('settlement_data', 'is', null)
            .neq('settlement_data', '{}');

        if (countError) {
            throw new InternalServerErrorException(countError.message);
        }

        const total = count ?? 0;

        // Get paginated data
        const { data, error } = await this.client
            .from('market_oracle_db')
            .select('market_address')
            .not('settlement_data', 'is', null)
            .neq('settlement_data', '{}')
            .range(offset, offset + limit - 1);

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        return {
            data: (data ?? []).map((row) => row.market_address),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ─── Endpoint 3: GET /market ──────────────────────────────────────────
    async getAllMarkets(page: number, limit: number) {
        const offset = (page - 1) * limit;

        // Count total
        const { count, error: countError } = await this.client
            .from('market_allData')
            .select('id', { count: 'exact', head: true });

        if (countError) {
            throw new InternalServerErrorException(countError.message);
        }

        const total = count ?? 0;

        // Get paginated market_allData
        const { data: markets, error: marketsError } = await this.client
            .from('market_allData')
            .select(MARKET_ALL_DATA_COLUMNS)
            .range(offset, offset + limit - 1);

        if (marketsError) {
            throw new InternalServerErrorException(marketsError.message);
        }

        if (!markets || markets.length === 0) {
            return { data: [], page, limit, total, totalPages: Math.ceil(total / limit) };
        }

        // Batch-fetch oracle data for these markets (chunked to avoid URL limits)
        const addresses = markets.map((m: any) => m.market);
        const oracleChunks: string[][] = [];
        for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
            oracleChunks.push(addresses.slice(i, i + BATCH_SIZE));
        }
        const oracleResults = await Promise.all(
            oracleChunks.map((chunk) =>
                this.client
                    .from('market_oracle_db')
                    .select('market_address,settlement_criteria,settlement_data')
                    .in('market_address', chunk),
            ),
        );
        const oracleRows: Record<string, any>[] = [];
        for (const r of oracleResults) {
            if (r.error) throw new InternalServerErrorException(r.error.message);
            oracleRows.push(...((r.data ?? []) as Record<string, any>[]));
        }

        // Build lookup map
        const oracleMap = new Map<string, Record<string, any>>();
        for (const row of oracleRows ?? []) {
            oracleMap.set(row.market_address, row);
        }

        // Merge
        const data = markets.map((m: any) => {
            const mapped = mapMarketRow(m);
            const oracle = oracleMap.get(m.market);
            return {
                ...mapped,
                settlement_criteria: oracle?.settlement_criteria ?? null,
                settlement_data: oracle?.settlement_data ?? null,
            };
        });

        return {
            data,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ─── Endpoint 4: GET /market/all/:address ─────────────────────────────
    async getMarketByAddress(address: string) {
        const { data: market, error: marketError } = await this.client
            .from('market_allData')
            .select(MARKET_ALL_DATA_COLUMNS)
            .eq('market', address)
            .maybeSingle();

        if (marketError) {
            throw new InternalServerErrorException(marketError.message);
        }

        if (!market) {
            throw new NotFoundException(`Market with address ${address} not found`);
        }

        // Fetch oracle data
        const { data: oracle, error: oracleError } = await this.client
            .from('market_oracle_db')
            .select('settlement_criteria,settlement_data')
            .eq('market_address', address)
            .maybeSingle();

        if (oracleError) {
            throw new InternalServerErrorException(oracleError.message);
        }

        const mapped = mapMarketRow(market);
        return {
            ...mapped,
            settlement_criteria: oracle?.settlement_criteria ?? null,
            settlement_data: oracle?.settlement_data ?? null,
        };
    }

    // ─── Endpoint 5: GET /market/settlementData/:address ──────────────────
    async getSettlementData(address: string) {
        const { data, error } = await this.client
            .from('market_oracle_db')
            .select('settlement_data')
            .eq('market_address', address)
            .maybeSingle();

        if (error) {
            throw new InternalServerErrorException(error.message);
        }

        if (!data || !data.settlement_data) {
            throw new NotFoundException(
                `Settlement data not found for market ${address}`,
            );
        }

        return data.settlement_data;
    }

    // ─── Endpoint 6: GET /market/settled/details ──────────────────────────
    async getSettledDetails(page: number, limit: number) {
        const offset = (page - 1) * limit;

        // Count settled
        const { count, error: countError } = await this.client
            .from('market_oracle_db')
            .select('id', { count: 'exact', head: true })
            .not('settlement_data', 'is', null)
            .neq('settlement_data', '{}');

        if (countError) {
            throw new InternalServerErrorException(countError.message);
        }

        const total = count ?? 0;

        // Paginated oracle rows
        const { data: oracleRows, error: oracleError } = await this.client
            .from('market_oracle_db')
            .select('market_address,question,settlement_criteria,settlement_data,market_endTime,type')
            .not('settlement_data', 'is', null)
            .neq('settlement_data', '{}')
            .range(offset, offset + limit - 1);

        if (oracleError) {
            throw new InternalServerErrorException(oracleError.message);
        }

        if (!oracleRows || oracleRows.length === 0) {
            return { data: [], page, limit, total, totalPages: Math.ceil(total / limit) };
        }

        // Batch-fetch market_allData for these addresses (chunked to avoid URL limits)
        const addresses = oracleRows.map((r) => r.market_address);
        const markets = await batchFetchMarkets(this.client, addresses, MARKET_ALL_DATA_COLUMNS);

        // Build lookup
        const marketMap = new Map<string, Record<string, any>>();
        for (const m of markets) {
            marketMap.set(m.market, mapMarketRow(m)!);
        }

        // Merge — keep oracle rows even if no market_allData match
        const data = oracleRows.map((oracleRow) => {
            const marketRow = marketMap.get(oracleRow.market_address) ?? null;
            return mergeMarketAndOracle(marketRow, oracleRow, true);
        });

        return {
            data,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ─── Endpoint 7: GET /market/resolvable/details ───────────────────────
    async getResolvableDetails() {
        // Get all resolvable oracle rows
        const { data: oracleRows, error: oracleError } = await this.client
            .from('market_oracle_db')
            .select('market_address,question,settlement_criteria,market_endTime,type')
            .or('settlement_data.is.null,settlement_data.eq.{}');

        if (oracleError) {
            throw new InternalServerErrorException(oracleError.message);
        }

        if (!oracleRows || oracleRows.length === 0) {
            return [];
        }

        // Batch-fetch market_allData (chunked to avoid URL limits with 300+ addresses)
        const addresses = oracleRows.map((r) => r.market_address);
        const markets = await batchFetchMarkets(this.client, addresses, MARKET_ALL_DATA_COLUMNS);

        const marketMap = new Map<string, Record<string, any>>();
        for (const m of markets) {
            marketMap.set(m.market, mapMarketRow(m)!);
        }

        return oracleRows.map((oracleRow) => {
            const marketRow = marketMap.get(oracleRow.market_address) ?? null;
            return mergeMarketAndOracle(marketRow, oracleRow, false);
        });
    }

    // ─── Endpoint 8: GET /market/stats ────────────────────────────────────
    async getStats() {
        const [
            totalMarketsResult,
            totalResolvableResult,
            totalSettledResult,
            settledThisWeekResult,
            settledThisMonthResult,
            categoriesResult,
        ] = await Promise.all([
            // totalMarkets
            this.client
                .from('market_allData')
                .select('id', { count: 'exact', head: true }),

            // totalResolvable
            this.client
                .from('market_oracle_db')
                .select('id', { count: 'exact', head: true })
                .or('settlement_data.is.null,settlement_data.eq.{}'),

            // totalSettled
            this.client
                .from('market_oracle_db')
                .select('id', { count: 'exact', head: true })
                .not('settlement_data', 'is', null)
                .neq('settlement_data', '{}'),

            // settledThisWeek — settlement_data IS NOT NULL AND market_endTime >= 7 days ago
            this.client
                .from('market_oracle_db')
                .select('id', { count: 'exact', head: true })
                .not('settlement_data', 'is', null)
                .neq('settlement_data', '{}')
                .gte('market_endTime', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

            // settledThisMonth
            this.client
                .from('market_oracle_db')
                .select('id', { count: 'exact', head: true })
                .not('settlement_data', 'is', null)
                .neq('settlement_data', '{}')
                .gte('market_endTime', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

            // categories — we need the actual data, not just count
            this.client
                .from('market_allData')
                .select('category'),
        ]);

        // Check for errors
        for (const result of [
            totalMarketsResult,
            totalResolvableResult,
            totalSettledResult,
            settledThisWeekResult,
            settledThisMonthResult,
            categoriesResult,
        ]) {
            if (result.error) {
                throw new InternalServerErrorException(result.error.message);
            }
        }

        // Aggregate categories in application code
        const categoryCountMap = new Map<string, number>();
        for (const row of categoriesResult.data ?? []) {
            if (row.category != null) {
                categoryCountMap.set(
                    row.category,
                    (categoryCountMap.get(row.category) ?? 0) + 1,
                );
            }
        }

        const categories = Array.from(categoryCountMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        return {
            totalMarkets: totalMarketsResult.count ?? 0,
            totalResolvable: totalResolvableResult.count ?? 0,
            totalSettled: totalSettledResult.count ?? 0,
            settledThisWeek: settledThisWeekResult.count ?? 0,
            settledThisMonth: settledThisMonthResult.count ?? 0,
            categories,
        };
    }
}
