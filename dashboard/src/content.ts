import type { Region } from './types'

export interface RegionStory {
  tagline: string
  states: string
  strengths: string[]
  constraints: string[]
  role2047: string
  policy: string[]
}

/** Qualitative rationale. Every quantity shown next to these stories is computed live from the model outputs. */
export const REGION_STORY: Record<Region, RegionStory> = {
  North: {
    tagline: 'Desert solar and Himalayan hydro make the North a clean-power exporter.',
    states: 'Rajasthan, Uttar Pradesh, Punjab, Haryana, Delhi, Himachal Pradesh, Uttarakhand, Jammu & Kashmir, Ladakh, Chandigarh',
    strengths: [
      'Rajasthan has the largest solar generation potential of any state (NISE: Thar desert irradiance, large wasteland tracts). It holds about three-quarters of the solar potential of the whole region.',
      'Rajasthan has the largest 150 m wind potential in the country (NIWE), mostly in the 25–32% CUF bands.',
      'Himalayan rivers in Himachal Pradesh, Uttarakhand and J&K hold about a third of India\'s exploitable hydro potential (CEA). This firms evening and winter supply.',
      'Nuclear sites already exist or are planned at Rawatbhata and Mahi Banswara (Rajasthan), Gorakhpur (Haryana) and Narora (UP).',
    ],
    constraints: [
      'Uttar Pradesh has the largest population and fast urbanisation, so the regional requirement grows quickly.',
      'Water stress in Rajasthan favours dry/robotic module cleaning and air-cooled thermal plants.',
      'The coal fleet is load-centre (non-pithead), so it gets no new coal. Existing young units run out their life.',
    ],
    role2047: 'Solar-led, with hydro and nuclear as firm power. A net supplier to the national grid via Green Energy Corridors.',
    policy: ['Green Energy Corridor phases II–III', 'Rajasthan and Ladakh renewable energy zones', 'Pumped-storage policy for Himalayan reservoirs'],
  },
  West: {
    tagline: 'The industrial heartland. Pithead coal transitions alongside Gujarat–Maharashtra wind and solar.',
    states: 'Gujarat, Maharashtra, Madhya Pradesh, Chhattisgarh, Goa, Dadra & Nagar Haveli and Daman & Diu',
    strengths: [
      'Gujarat (Kutch) and Maharashtra have top-tier wind (Gujarat has more 40%+ CUF land than any other state) and large solar potential.',
      'Pithead coal in Chhattisgarh (Korba) and MP (Singrauli) gives the cheapest firm thermal power. It is retained as the national balancing reserve.',
      'Nuclear sites: Tarapur, Jaitapur (MH), Kakrapar, Mithi Virdi (GJ) and Chutka (MP).',
      'LNG terminals on the Gujarat/Maharashtra coast support flexible gas generation.',
    ],
    constraints: [
      'Largest absolute coal emissions of any region. Fleet life-extension needs efficiency upgrades and CCUS-readiness.',
      'Industrial demand growth (green hydrogen in Gujarat, data centres in Maharashtra) concentrates load here.',
    ],
    role2047: 'Largest producer. Balanced coal/VRE mix that supplies firm power to deficit regions while renewables scale up.',
    policy: ['Gujarat hybrid renewable energy park (Khavda)', 'Deendayal (Kandla) green hydrogen hub', 'Coal plant flexibilisation (CEA 40% minimum load)'],
  },
  South: {
    tagline: 'India\'s best wind, strong solar and a nuclear cluster: the most decarbonised region by 2047.',
    states: 'Tamil Nadu, Karnataka, Andhra Pradesh, Telangana, Kerala, Puducherry, Lakshadweep',
    strengths: [
      'Tamil Nadu, Karnataka and Andhra Pradesh are, after Gujarat, the states with the most 38%+ CUF wind land. Offshore wind potential off Tamil Nadu is upside not modelled here.',
      'Deccan plateau solar has high irradiance. Rooftop potential is large given high urbanisation (TN, Kerala).',
      'Nuclear cluster at Kudankulam, Kalpakkam (fast-breeder), Kaiga and Kovvada.',
      'Wind (monsoon peak) and solar (dry-season peak) complement each other seasonally.',
    ],
    constraints: [
      'The most urbanised region, with high per-capita generation growth.',
      'Limited remaining hydro. Kerala and Karnataka reservoirs are better used for pumped storage than for new energy.',
    ],
    role2047: 'Wind + solar + nuclear. Exports clean power. Lowest grid carbon intensity among large regions.',
    policy: ['Offshore wind tenders (TN, GJ)', 'PM Surya Ghar rooftop programme', 'Fleet-mode PHWR construction'],
  },
  East: {
    tagline: 'The coal heartland. Huge population growth, limited wind: production shifts out and imports clean power.',
    states: 'Bihar, Jharkhand, Odisha, West Bengal, Sikkim, Andaman & Nicobar Islands',
    strengths: [
      'Jharkhand, Odisha and West Bengal hold a large share of India\'s coal reserves. Pithead generation is cheapest here.',
      'Odisha has India\'s fourth-largest floating-solar potential (NISE: Hirakud, Rengali reservoirs) and the largest ground-mounted solar potential in the East.',
      'Teesta (Sikkim) and Odisha hydro. Haripur is a candidate coastal nuclear site.',
    ],
    constraints: [
      'Wind potential is negligible (<50 TWh). Ground-mounted solar is constrained by dense agriculture and population.',
      'Bihar has the fastest population growth and lowest urbanisation, so the requirement more than triples by 2047.',
      'Heavy coal dependence means the highest grid intensity in 2047. Priority for CCUS pilots and a just-transition plan.',
    ],
    role2047: 'Firm-power anchor (pithead coal) and a net importer of clean power from North and South. Rooftop + floating solar maximised.',
    policy: ['Just Energy Transition planning for Jharkhand/Odisha coal districts', 'CCUS mission pilots', 'Inter-regional HVDC links (ER–NR, ER–SR)'],
  },
  'North-East': {
    tagline: 'Brahmaputra-basin hydro: India\'s untapped clean firm power, exported to the mainland.',
    states: 'Arunachal Pradesh, Assam, Meghalaya, Manipur, Mizoram, Nagaland, Tripura',
    strengths: [
      'Arunachal Pradesh alone holds 38% of India\'s exploitable hydro potential (CEA) (Siang, Subansiri, Dibang, Lohit basins).',
      'Domestic natural gas in Assam and Tripura gives local flexibility.',
      'Small, slow-growing requirement, so most new hydro output is exportable.',
    ],
    constraints: [
      'Seismic risk, ecological sensitivity and downstream concerns: modelled with only 60% of the usual hydro development rate.',
      'Evacuation through the narrow Siliguri corridor needs dedicated HVDC (Brahmaputra basin master plan).',
      'Wind potential is negligible. Solar is limited by terrain and cloud cover.',
    ],
    role2047: 'Hydro export hub (allowed to produce up to 3× its own requirement), with gas for local balancing.',
    policy: ['Brahmaputra basin hydro evacuation master plan (CEA)', 'Upper Siang multipurpose project', 'NE gas grid (Indradhanush)'],
  },
}

export const ASSUMPTIONS: { area: string; item: string; value: string; basis: string }[] = [
  { area: 'Metric', item: 'Energy measure', value: 'Electricity generation (TWh) only', basis: 'Challenge rule. No installed capacity or consumption data enters forecasting or comparison.' },
  { area: 'Metric', item: 'National basis', value: 'Total generation incl. captive (2,082 TWh in 2025)', basis: 'Energy Institute / Ember via OWID (published statistics, used as supporting literature). The production requirement includes captive industrial generation, which NPP does not report.' },
  { area: 'Metric', item: 'Regional basis', value: 'National Power Portal state × fuel generation (coal, gas, nuclear, large hydro, 2020–25) + Ember for solar, wind, bio, small hydro (not on NPP); scaled per source to the national total', basis: 'NPP is a provided dataset. Ember equals NPP to 0.0% wherever both publish. The captive/rooftop gap for each source is distributed by the region\'s share of that source.' },
  { area: 'Demand drivers', item: 'Population', value: 'UN WPP 2024 medium: 1.67 bn in 2047', basis: 'State shares follow a 2015–24 trend, damped to zero by 2047.' },
  { area: 'Demand drivers', item: 'State income', value: 'Challenge-dataset GSDP (constant 2011-12 prices), 2015–19 window', basis: 'Its 2021–24 values are imputed (linear, no post-COVID rebound), so only observed pre-COVID years are used. State-vs-national growth differential capped at ±1.5%/yr, decaying with a 15-year half-life.' },
  { area: 'Demand drivers', item: 'Urbanisation', value: '42.2% in 2047 (UN WUP); 40% low / 50% high', basis: 'State levels: Census 2011, logit-shifted so the population-weighted mean matches the national path.' },
  { area: 'Demand drivers', item: 'Real GDP growth', value: 'Base 6.5% → 6.0% → 5.0% (2026-30 / 31-40 / 41-47)', basis: 'IMF/RBI medium-term consensus. Low 5.5/5.0/4.0, High 7.5/7.5/6.5.' },
  { area: 'Model', item: 'Urbanisation effect', value: '+2.25% generation per capita per pp urban', basis: 'Panel of 41 economies with country + year fixed effects (se 0.5%). India-only estimate is confounded by trend.' },
  { area: 'Model', item: 'Ensemble weights', value: 'Inverse of 2015–25 backtest MAPE', basis: 'Out-of-sample: train ≤2014, forecast 2015–2025 with realised drivers.' },
  { area: 'New loads', item: 'Green hydrogen', value: '7.8 Mt/yr by 2047 at 55 kWh/kg ≈ 429 TWh (low 6.8 / high 22 Mt)', basis: 'Path from the National Green Hydrogen Mission (5 Mt by 2030) to NITI Aayog 2050 (8.4 Mt Current Policy, 22 Mt Net Zero). NITI Aayog, Scenarios towards Viksit Bharat and Net Zero, Vol. 6 Industry (Feb 2026). 55 kWh/kg is the NITI figure.' },
  { area: 'New loads', item: 'E-mobility', value: '305 TWh end-use beyond trend (base; low 155 / high 425)', basis: 'NITI Aayog transport electricity: 34 TWh (2024) to about 550 TWh (2050, Current Policy), interpolated to 2047 = 399 TWh, minus the 2024 load already inside the historical trend (34 TWh grown with the trend). Vol. 7 Power and Vol. 3 Transport (Feb 2026). Grossed up for 12% losses; scaled 0.3–1.7× in the Monte Carlo.' },
  { area: 'New loads', item: 'Data centres', value: '295 TWh end-use beyond trend (base; low 195 / high 365)', basis: 'NITI Aayog: about 10 GW average load in 2030 (88 TWh) rising to about 400 TWh in 2050, interpolated to 2047 = 319 TWh, minus the 9 TWh of 2024 (IEA Energy and AI) grown with the trend. Vol. 5 Buildings and Vol. 7 Power (Feb 2026). Cross-check: Ministry of Power 13.56 GW and CEA 17 GW for 2031-32 (about 100 to 150 TWh) bracket our ~102 TWh in 2032. Grossed up for losses; scaled 0.3–1.7× in the Monte Carlo.' },
  { area: 'Resources', item: 'Solar ceiling', value: '≈7,070 TWh/yr: ground-mounted 5,996 (NISE 2025, all 35 states/UTs) + floating 180 (NISE 2026) + rooftop 893 (CEEW 2023)', basis: 'Published capacity-type potentials converted to annual generation at state CUF 18–21% (rooftop 16%). Up to 44% developable by 2047.' },
  { area: 'Resources', item: 'Wind ceiling', value: '≈3,090 TWh/yr: NIWE 150 m atlas, state × CUF band', basis: 'Converted to annual generation at band mid-point CUF. Up to 35% developable by 2047.' },
  { area: 'Resources', item: 'Hydro ceiling', value: '≈506 TWh/yr: CEA 2017–23 reassessment, state-wise exploitable conventional potential (large schemes, as on 30.06.2024; pumped storage excluded)', basis: 'Converted at regional design load factor 30–45%. 65% of undeveloped potential by 2047 (NE at 60% of that rate). Small hydro is outside the table, so South and West, already at their ceiling, are held at 2025 output.' },
  { area: 'Strategy', item: 'Carbon price', value: '₹500 → ₹2,500/tCO₂ (Balanced)', basis: 'Carbon Credit Trading Scheme trajectory. ₹6,000 in Accelerated.' },
  { area: 'Strategy', item: 'VRE share limit', value: '30% (2030) → 61% (2047), +10 pp at extra storage cost', basis: 'Balancing limit with a storage/firming cost on VRE above 35%. Solar alone ≤45% (daytime-only profile). Sized so the recommended plan needs no tier-2 storage.' },
  { area: 'Strategy', item: 'Coal fleet', value: 'Existing output ≥50% retained in 2047; national cap 1,750 / 1,900 / 1,900 / 1,650 TWh (2030/35/40/47)', basis: 'Median fleet age <15 years, so no early stranding; the national coal pipeline under construction commissions to ~2032. Coal peaks by 2035, plateaus, then falls. New coal only at pitheads (East/West).' },
  { area: 'Strategy', item: 'Technology cost (LCOE, real 2025)', value: 'Solar ₹2.6→1.9, wind ₹3.1–3.4→2.7–3.0, pithead coal ₹4.1–4.3, load-centre coal ₹5.2–5.8, nuclear ₹6.4→5.6, gas ₹8.5 /kWh', basis: 'Analyst estimates in line with recent SECI/state auction tariffs for solar and wind and CERC-regulated thermal tariffs. Not a published series: ±20% tested in the sensitivity table.' },
  { area: 'Strategy', item: 'Build-rate limits', value: 'Max added generation per year: solar 110 → 200 TWh, wind 40 → 80 TWh, hydro 8 → 14 TWh', basis: 'Record year (2025): solar +53, wind +22 TWh, so the limits assume roughly a doubling to quadrupling of the current pace. Analyst assumption: ±20% tested.' },
  { area: 'Strategy', item: 'Committed pipeline', value: 'Nuclear ≥85 TWh (2030), ≥110 TWh (2035); hydro ≥205 / 225 TWh', basis: 'Units under construction: RAPP 7–8, Kudankulam 3–6, GHAVP 1–2, PFBR; Subansiri Lower, Teesta, Parbati, Pakal Dul, Ratle, Polavaram. ±20% of the additions tested.' },
  { area: 'Strategy', item: 'Nuclear ceiling', value: '700 TWh in 2047 (Balanced and Accelerated), 450 (Security)', basis: 'Nuclear Energy Mission target of 100 GW by 2047 (Union Budget 2025-26), about 700 TWh/yr at 80% availability.' },
  { area: 'Resources', item: 'Developable share', value: 'Solar ≤44%, wind ≤35%, hydro 65% of undeveloped potential by 2047', basis: 'Analyst assumption for land, evacuation and clearances. Sensitivity: at −20% the plan cannot meet the 2047 requirement without relaxing coal/nuclear limits.' },
  { area: 'Strategy', item: 'Emission factors', value: 'Coal 0.82, gas 0.49 tCO₂/MWh', basis: 'Derived from Ember India state emissions ÷ generation, 2019–24.' },
]

export const UNCERTAINTIES: { title: string; body: string }[] = [
  { title: 'Economic growth dominates', body: 'A ±1.2 pp sustained shift in GDP growth moves the 2047 requirement by roughly ±15–20%. The Monte Carlo P10–P90 band (≈5,300–8,300 TWh) is driven mostly by this.' },
  { title: 'Structural breaks', body: 'Green hydrogen, EVs and data centres have little history. They are added as explicit, adjustable loads (≈11% of 2047 base) rather than extrapolated, and are scaled 0.3–1.7× in the Monte Carlo.' },
  { title: 'Regional split', body: 'With only 7 years of state generation data, the shift-share model does not beat a constant-share baseline over 2019–24 (MAE 0.68 pp both). Regional numbers are a BAU production path. The optimiser decides where production should actually happen.' },
  { title: 'Captive generation', body: 'About 12% of national generation (mostly coal) is captive and not reported by state. It is allocated pro rata, so industrial states may be under- or over-stated.' },
  { title: 'Resource ceilings', body: 'Potentials come from official state-wise assessments (NISE 2025 solar, NIWE 150 m wind, CEA 2017–23 hydro). Land competition, transmission rights-of-way and clearances are represented only by a developable-share assumption. This is the plan\'s most sensitive input: at −20% the 2047 requirement is about 6% short unless coal or nuclear limits are relaxed (see the sensitivity table).' },
  { title: 'Hourly balancing not modelled', body: 'The optimiser is annual-energy. Storage needs are captured by VRE-share limits and a firming cost, not a chronological dispatch model.' },
]
