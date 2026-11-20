export type ScenarioKey = 'low' | 'base' | 'high'
export type StrategyKey = 'balanced' | 'accelerated' | 'security'
export type Source = 'coal' | 'nuclear' | 'gas' | 'bio' | 'hydro' | 'wind' | 'solar'
export type Region = 'North' | 'West' | 'South' | 'East' | 'North-East'

export interface NatForecastRow {
  scenario: ScenarioKey; year: number
  A_driver: number; B_crosscountry: number; C_ets: number; P_provided: number; trend: number
  green_hydrogen: number; e_mobility: number; data_centres: number; total: number
  population: number; gdp_pc_usd2015: number; urban_pct: number; kwh_per_capita: number
}
export interface FanRow { year: number; p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number }
export interface RegForecastRow { scenario: ScenarioKey; year: number; region: Region; twh: number; population: number; kwh_per_capita: number }
export interface StateForecastRow { scenario: ScenarioKey; year: number; state: string; region: Region; twh: number; population: number; urban_pct: number; gdppc_rel_usd2015: number }
export interface MixRow { strategy: StrategyKey; scenario: ScenarioKey; year: number; region: Region; source: Source; twh: number }
export interface SummaryRow {
  strategy: StrategyKey; scenario: ScenarioKey; year: number; region: Region
  production_twh: number; bau_requirement_twh: number; shift_vs_bau_twh: number; emissions_mt: number
  clean_share: number; vre_share: number; intensity_g_per_kwh: number
}
export interface ScenarioDef { label: string; notes: string; gdp_growth: [number, number, number][]; urban_2047: number; pop_mult_2047: number; h2_mt_2047: number; ev_twh_2047: number; dc_twh_2047: number }
export interface StrategyDef { label: string; desc: string; carbon: Record<string, number>; vre_max: Record<string, number>; solar_max: Record<string, number>; nuclear_max: Record<string, number>; coal_cap: Record<string, number>; coal_survival: Record<string, number> }
export interface RunInfo { unserved: Record<string, number>; vre_tier2: Record<string, number>; coal_over: Record<string, number>; self_shortfall: Record<string, number>; marginal_cost: Record<string, number> }

export interface Calculator {
  years: number[]; epc0: number; gdp0_usd2015: number; pop_un: number[]; urban_un: number[]
  lg_anchor: number; lg_anchor_year: number; gdppc_wb_anchor: number
  A: { const: number; lg: number; u: number }
  B: { lg: number; lg2: number; urban: number }
  weights: { A_driver: number; B_crosscountry: number; C_ets: number; P_provided: number }
  C_path: number[]; P_path: number[]; AB_base: number[]; loss: number; h2_kwh_per_kg: number
}

export interface Bundle {
  generated: string
  regions: Region[]
  states: { name: string; region: Region; code: string; island: boolean }[]
  scenarios: Record<ScenarioKey, ScenarioDef>
  strategies: Record<StrategyKey, StrategyDef>
  runs: Record<string, RunInfo>
  model: {
    weights: Record<string, number>; backtest_mape: Record<string, number>
    A: Record<string, number>; A_bse: Record<string, number>; A_r2: number
    B: Record<string, number>; B_bse: Record<string, number>; B_r2: number; B_countries: number
    P: { slope: number; se: number; years: number[]; epc: number[] }; P_weight: number
    national_basis: 'grid' | 'owid'; anchor_2025_twh: number
    captive: { twh_2025: number; slope: number; share_2025: number; twh_2047_trend: number; years: number[]; twh: number[] }
  }
  optimizer: Record<string, unknown> & {
    lcoe: Record<Source, Record<Region, [number, number]>>; ef: Record<string, number>
    wheeling: number; firming: number; vre_free: number; self_target: number; self_floor: number
    export_max: Record<Region, number>; nuclear_site_share: Record<Region, number>
    solar_share: Record<string, number>; wind_share: Record<string, number>; hydro_dev: Record<string, number>
    build: Record<string, Record<string, number>>; committed: Record<string, Record<string, number>>
  }
  history: {
    national: ({ year: number; total: number; grid: number | null } & Record<string, number | null>)[]
    drivers: { year: number; population: number; urban_pct: number; gdp_usd2015: number; gdp_pc_usd2015: number }[]
    regional: { year: number; region: Region; source: string; twh: number }[]
    states: { year: number; state: string; region: Region; twh: number }[]
  }
  forecast: { national: NatForecastRow[]; fan: FanRow[]; regional: RegForecastRow[]; states: StateForecastRow[] }
  strategy: { mix: MixRow[]; summary: SummaryRow[] }
  potential: { region: { region: Region; source: Source; twh_potential: number }[]; state: { state: string; source: Source; component: string; twh_potential: number; region: Region }[] }
  backtest: { national: { year: number; actual: number; A_driver: number; B_crosscountry: number; C_ets: number }[]; regional: { region: Region; actual_share_2024: number; shift_share_pred: number; naive_2019_share: number }[] }
  sensitivity: SensRow[]
  state_drivers_2024: { state: string; region: Region; population: number; gsdp_cr: number; urban_pct_2011: number }[]
  calculator: Calculator
}

export interface SensRow {
  assumption: string; case: 'central' | '-20%' | '+20%'; req_2047_twh: number
  clean_share_2047: number; g_per_kwh_2047: number; coal_2047_twh: number; coal_peak_twh: number; coal_peak_year: number
  solar_2047_twh: number; wind_2047_twh: number; nuclear_2047_twh: number
  vre_tier2_2047_twh: number; unserved_2047_twh: number; system_cost_rs_kwh: number
}
