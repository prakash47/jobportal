// GENERATED FILE - do not edit by hand.
//
// Built by scripts/build-flag-sprite.mjs from `world-countries` (dial codes and
// names) and `flag-icons` (MIT, the flag artwork). Regenerate that way rather
// than editing, or the sprite offsets below will stop matching flags.webp.
//
// Flag EMOJI are deliberately not used. Windows ships no flag glyphs, so
// U+1F1EE U+1F1F3 renders as the letters "IN" - measured in a real browser
// here, 0 coloured pixels out of 336 - and CLAUDE.md section 2 bans emoji as UI
// elements besides. The artwork is a single sprite fetched once, which keeps it
// out of the JS bundle entirely and so off the 150 KB first-load budget.

/** ISO 3166-1 alpha-2, English name, dial code, and sprite cell. */
export type Country = readonly [iso: string, name: string, dial: string, col: number, row: number];

/** Cell size in CSS pixels. The sprite itself is drawn at 2x for retina. */
export const FLAG_W = 20;
export const FLAG_H = 15;
export const FLAG_COLS = 16;
export const FLAG_ROWS = 16;
export const FLAG_SPRITE_URL = '/flags.webp';

/** The default, per the owner: India. */
export const DEFAULT_COUNTRY_ISO = 'IN';

export const COUNTRIES: readonly Country[] = [
  ['AF', "Afghanistan", '+93', 0, 0],
  ['AX', "Åland Islands", '+358', 1, 0],
  ['AL', "Albania", '+355', 2, 0],
  ['DZ', "Algeria", '+213', 3, 0],
  ['AS', "American Samoa", '+1684', 4, 0],
  ['AD', "Andorra", '+376', 5, 0],
  ['AO', "Angola", '+244', 6, 0],
  ['AI', "Anguilla", '+1264', 7, 0],
  ['AG', "Antigua and Barbuda", '+1268', 8, 0],
  ['AR', "Argentina", '+54', 9, 0],
  ['AM', "Armenia", '+374', 10, 0],
  ['AW', "Aruba", '+297', 11, 0],
  ['AU', "Australia", '+61', 12, 0],
  ['AT', "Austria", '+43', 13, 0],
  ['AZ', "Azerbaijan", '+994', 14, 0],
  ['BS', "Bahamas", '+1242', 15, 0],
  ['BH', "Bahrain", '+973', 0, 1],
  ['BD', "Bangladesh", '+880', 1, 1],
  ['BB', "Barbados", '+1246', 2, 1],
  ['BY', "Belarus", '+375', 3, 1],
  ['BE', "Belgium", '+32', 4, 1],
  ['BZ', "Belize", '+501', 5, 1],
  ['BJ', "Benin", '+229', 6, 1],
  ['BM', "Bermuda", '+1441', 7, 1],
  ['BT', "Bhutan", '+975', 8, 1],
  ['BO', "Bolivia", '+591', 9, 1],
  ['BA', "Bosnia and Herzegovina", '+387', 10, 1],
  ['BW', "Botswana", '+267', 11, 1],
  ['BV', "Bouvet Island", '+47', 12, 1],
  ['BR', "Brazil", '+55', 13, 1],
  ['IO', "British Indian Ocean Territory", '+246', 14, 1],
  ['VG', "British Virgin Islands", '+1284', 15, 1],
  ['BN', "Brunei", '+673', 0, 2],
  ['BG', "Bulgaria", '+359', 1, 2],
  ['BF', "Burkina Faso", '+226', 2, 2],
  ['BI', "Burundi", '+257', 3, 2],
  ['KH', "Cambodia", '+855', 4, 2],
  ['CM', "Cameroon", '+237', 5, 2],
  ['CA', "Canada", '+1', 6, 2],
  ['CV', "Cape Verde", '+238', 7, 2],
  ['BQ', "Caribbean Netherlands", '+599', 8, 2],
  ['KY', "Cayman Islands", '+1345', 9, 2],
  ['CF', "Central African Republic", '+236', 10, 2],
  ['TD', "Chad", '+235', 11, 2],
  ['CL', "Chile", '+56', 12, 2],
  ['CN', "China", '+86', 13, 2],
  ['CX', "Christmas Island", '+61', 14, 2],
  ['CC', "Cocos (Keeling) Islands", '+61', 15, 2],
  ['CO', "Colombia", '+57', 0, 3],
  ['KM', "Comoros", '+269', 1, 3],
  ['CK', "Cook Islands", '+682', 2, 3],
  ['CR', "Costa Rica", '+506', 3, 3],
  ['HR', "Croatia", '+385', 4, 3],
  ['CU', "Cuba", '+53', 5, 3],
  ['CW', "Curaçao", '+599', 6, 3],
  ['CY', "Cyprus", '+357', 7, 3],
  ['CZ', "Czechia", '+420', 8, 3],
  ['DK', "Denmark", '+45', 9, 3],
  ['DJ', "Djibouti", '+253', 10, 3],
  ['DM', "Dominica", '+1767', 11, 3],
  ['DO', "Dominican Republic", '+1', 12, 3],
  ['CD', "DR Congo", '+243', 13, 3],
  ['EC', "Ecuador", '+593', 14, 3],
  ['EG', "Egypt", '+20', 15, 3],
  ['SV', "El Salvador", '+503', 0, 4],
  ['GQ', "Equatorial Guinea", '+240', 1, 4],
  ['ER', "Eritrea", '+291', 2, 4],
  ['EE', "Estonia", '+372', 3, 4],
  ['SZ', "Eswatini", '+268', 4, 4],
  ['ET', "Ethiopia", '+251', 5, 4],
  ['FK', "Falkland Islands", '+500', 6, 4],
  ['FO', "Faroe Islands", '+298', 7, 4],
  ['FJ', "Fiji", '+679', 8, 4],
  ['FI', "Finland", '+358', 9, 4],
  ['FR', "France", '+33', 10, 4],
  ['GF', "French Guiana", '+594', 11, 4],
  ['PF', "French Polynesia", '+689', 12, 4],
  ['TF', "French Southern and Antarctic Lands", '+262', 13, 4],
  ['GA', "Gabon", '+241', 14, 4],
  ['GM', "Gambia", '+220', 15, 4],
  ['GE', "Georgia", '+995', 0, 5],
  ['DE', "Germany", '+49', 1, 5],
  ['GH', "Ghana", '+233', 2, 5],
  ['GI', "Gibraltar", '+350', 3, 5],
  ['GR', "Greece", '+30', 4, 5],
  ['GL', "Greenland", '+299', 5, 5],
  ['GD', "Grenada", '+1473', 6, 5],
  ['GP', "Guadeloupe", '+590', 7, 5],
  ['GU', "Guam", '+1671', 8, 5],
  ['GT', "Guatemala", '+502', 9, 5],
  ['GG', "Guernsey", '+44', 10, 5],
  ['GN', "Guinea", '+224', 11, 5],
  ['GW', "Guinea-Bissau", '+245', 12, 5],
  ['GY', "Guyana", '+592', 13, 5],
  ['HT', "Haiti", '+509', 14, 5],
  ['HN', "Honduras", '+504', 15, 5],
  ['HK', "Hong Kong", '+852', 0, 6],
  ['HU', "Hungary", '+36', 1, 6],
  ['IS', "Iceland", '+354', 2, 6],
  ['IN', "India", '+91', 3, 6],
  ['ID', "Indonesia", '+62', 4, 6],
  ['IR', "Iran", '+98', 5, 6],
  ['IQ', "Iraq", '+964', 6, 6],
  ['IE', "Ireland", '+353', 7, 6],
  ['IM', "Isle of Man", '+44', 8, 6],
  ['IL', "Israel", '+972', 9, 6],
  ['IT', "Italy", '+39', 10, 6],
  ['CI', "Ivory Coast", '+225', 11, 6],
  ['JM', "Jamaica", '+1876', 12, 6],
  ['JP', "Japan", '+81', 13, 6],
  ['JE', "Jersey", '+44', 14, 6],
  ['JO', "Jordan", '+962', 15, 6],
  ['KZ', "Kazakhstan", '+7', 0, 7],
  ['KE', "Kenya", '+254', 1, 7],
  ['KI', "Kiribati", '+686', 2, 7],
  ['XK', "Kosovo", '+383', 3, 7],
  ['KW', "Kuwait", '+965', 4, 7],
  ['KG', "Kyrgyzstan", '+996', 5, 7],
  ['LA', "Laos", '+856', 6, 7],
  ['LV', "Latvia", '+371', 7, 7],
  ['LB', "Lebanon", '+961', 8, 7],
  ['LS', "Lesotho", '+266', 9, 7],
  ['LR', "Liberia", '+231', 10, 7],
  ['LY', "Libya", '+218', 11, 7],
  ['LI', "Liechtenstein", '+423', 12, 7],
  ['LT', "Lithuania", '+370', 13, 7],
  ['LU', "Luxembourg", '+352', 14, 7],
  ['MO', "Macau", '+853', 15, 7],
  ['MG', "Madagascar", '+261', 0, 8],
  ['MW', "Malawi", '+265', 1, 8],
  ['MY', "Malaysia", '+60', 2, 8],
  ['MV', "Maldives", '+960', 3, 8],
  ['ML', "Mali", '+223', 4, 8],
  ['MT', "Malta", '+356', 5, 8],
  ['MH', "Marshall Islands", '+692', 6, 8],
  ['MQ', "Martinique", '+596', 7, 8],
  ['MR', "Mauritania", '+222', 8, 8],
  ['MU', "Mauritius", '+230', 9, 8],
  ['YT', "Mayotte", '+262', 10, 8],
  ['MX', "Mexico", '+52', 11, 8],
  ['FM', "Micronesia", '+691', 12, 8],
  ['MD', "Moldova", '+373', 13, 8],
  ['MC', "Monaco", '+377', 14, 8],
  ['MN', "Mongolia", '+976', 15, 8],
  ['ME', "Montenegro", '+382', 0, 9],
  ['MS', "Montserrat", '+1664', 1, 9],
  ['MA', "Morocco", '+212', 2, 9],
  ['MZ', "Mozambique", '+258', 3, 9],
  ['MM', "Myanmar", '+95', 4, 9],
  ['NA', "Namibia", '+264', 5, 9],
  ['NR', "Nauru", '+674', 6, 9],
  ['NP', "Nepal", '+977', 7, 9],
  ['NL', "Netherlands", '+31', 8, 9],
  ['NC', "New Caledonia", '+687', 9, 9],
  ['NZ', "New Zealand", '+64', 10, 9],
  ['NI', "Nicaragua", '+505', 11, 9],
  ['NE', "Niger", '+227', 12, 9],
  ['NG', "Nigeria", '+234', 13, 9],
  ['NU', "Niue", '+683', 14, 9],
  ['NF', "Norfolk Island", '+672', 15, 9],
  ['KP', "North Korea", '+850', 0, 10],
  ['MK', "North Macedonia", '+389', 1, 10],
  ['MP', "Northern Mariana Islands", '+1670', 2, 10],
  ['NO', "Norway", '+47', 3, 10],
  ['OM', "Oman", '+968', 4, 10],
  ['PK', "Pakistan", '+92', 5, 10],
  ['PW', "Palau", '+680', 6, 10],
  ['PS', "Palestine", '+970', 7, 10],
  ['PA', "Panama", '+507', 8, 10],
  ['PG', "Papua New Guinea", '+675', 9, 10],
  ['PY', "Paraguay", '+595', 10, 10],
  ['PE', "Peru", '+51', 11, 10],
  ['PH', "Philippines", '+63', 12, 10],
  ['PN', "Pitcairn Islands", '+64', 13, 10],
  ['PL', "Poland", '+48', 14, 10],
  ['PT', "Portugal", '+351', 15, 10],
  ['PR', "Puerto Rico", '+1', 0, 11],
  ['QA', "Qatar", '+974', 1, 11],
  ['CG', "Republic of the Congo", '+242', 2, 11],
  ['RE', "Réunion", '+262', 3, 11],
  ['RO', "Romania", '+40', 4, 11],
  ['RU', "Russia", '+7', 5, 11],
  ['RW', "Rwanda", '+250', 6, 11],
  ['BL', "Saint Barthélemy", '+590', 7, 11],
  ['SH', "Saint Helena, Ascension and Tristan da Cunha", '+290', 8, 11],
  ['KN', "Saint Kitts and Nevis", '+1869', 9, 11],
  ['LC', "Saint Lucia", '+1758', 10, 11],
  ['MF', "Saint Martin", '+590', 11, 11],
  ['PM', "Saint Pierre and Miquelon", '+508', 12, 11],
  ['VC', "Saint Vincent and the Grenadines", '+1784', 13, 11],
  ['WS', "Samoa", '+685', 14, 11],
  ['SM', "San Marino", '+378', 15, 11],
  ['ST', "São Tomé and Príncipe", '+239', 0, 12],
  ['SA', "Saudi Arabia", '+966', 1, 12],
  ['SN', "Senegal", '+221', 2, 12],
  ['RS', "Serbia", '+381', 3, 12],
  ['SC', "Seychelles", '+248', 4, 12],
  ['SL', "Sierra Leone", '+232', 5, 12],
  ['SG', "Singapore", '+65', 6, 12],
  ['SX', "Sint Maarten", '+1721', 7, 12],
  ['SK', "Slovakia", '+421', 8, 12],
  ['SI', "Slovenia", '+386', 9, 12],
  ['SB', "Solomon Islands", '+677', 10, 12],
  ['SO', "Somalia", '+252', 11, 12],
  ['ZA', "South Africa", '+27', 12, 12],
  ['GS', "South Georgia", '+500', 13, 12],
  ['KR', "South Korea", '+82', 14, 12],
  ['SS', "South Sudan", '+211', 15, 12],
  ['ES', "Spain", '+34', 0, 13],
  ['LK', "Sri Lanka", '+94', 1, 13],
  ['SD', "Sudan", '+249', 2, 13],
  ['SR', "Suriname", '+597', 3, 13],
  ['SJ', "Svalbard and Jan Mayen", '+4779', 4, 13],
  ['SE', "Sweden", '+46', 5, 13],
  ['CH', "Switzerland", '+41', 6, 13],
  ['SY', "Syria", '+963', 7, 13],
  ['TW', "Taiwan", '+886', 8, 13],
  ['TJ', "Tajikistan", '+992', 9, 13],
  ['TZ', "Tanzania", '+255', 10, 13],
  ['TH', "Thailand", '+66', 11, 13],
  ['TL', "Timor-Leste", '+670', 12, 13],
  ['TG', "Togo", '+228', 13, 13],
  ['TK', "Tokelau", '+690', 14, 13],
  ['TO', "Tonga", '+676', 15, 13],
  ['TT', "Trinidad and Tobago", '+1868', 0, 14],
  ['TN', "Tunisia", '+216', 1, 14],
  ['TR', "Türkiye", '+90', 2, 14],
  ['TM', "Turkmenistan", '+993', 3, 14],
  ['TC', "Turks and Caicos Islands", '+1649', 4, 14],
  ['TV', "Tuvalu", '+688', 5, 14],
  ['UG', "Uganda", '+256', 6, 14],
  ['UA', "Ukraine", '+380', 7, 14],
  ['AE', "United Arab Emirates", '+971', 8, 14],
  ['GB', "United Kingdom", '+44', 9, 14],
  ['US', "United States", '+1', 10, 14],
  ['UM', "United States Minor Outlying Islands", '+268', 11, 14],
  ['VI', "United States Virgin Islands", '+1340', 12, 14],
  ['UY', "Uruguay", '+598', 13, 14],
  ['UZ', "Uzbekistan", '+998', 14, 14],
  ['VU', "Vanuatu", '+678', 15, 14],
  ['VA', "Vatican City", '+39', 0, 15],
  ['VE', "Venezuela", '+58', 1, 15],
  ['VN', "Vietnam", '+84', 2, 15],
  ['WF', "Wallis and Futuna", '+681', 3, 15],
  ['EH', "Western Sahara", '+212', 4, 15],
  ['YE', "Yemen", '+967', 5, 15],
  ['ZM', "Zambia", '+260', 6, 15],
  ['ZW', "Zimbabwe", '+263', 7, 15],
];

/**
 * Inline style positioning one flag out of the sprite.
 *
 * background-size is expressed in CSS pixels of the WHOLE sheet, which is what
 * scales the 2x artwork back down to a crisp ${FLAG_W}x${FLAG_H} cell.
 */
export function flagStyle(col: number, row: number) {
  return {
    width: `${FLAG_W}px`,
    height: `${FLAG_H}px`,
    backgroundImage: `url(${FLAG_SPRITE_URL})`,
    backgroundSize: `${FLAG_COLS * FLAG_W}px ${FLAG_ROWS * FLAG_H}px`,
    backgroundPosition: `-${col * FLAG_W}px -${row * FLAG_H}px`,
  } as const;
}

/** Look up by ISO code. Falls back to the default rather than returning null. */
export function countryByIso(iso: string): Country {
  const hit = COUNTRIES.find((c) => c[0] === iso.toUpperCase());
  if (hit) return hit;
  const fallback = COUNTRIES.find((c) => c[0] === DEFAULT_COUNTRY_ISO);
  if (!fallback) throw new Error('country list is missing its default');
  return fallback;
}

/**
 * Match on name prefix, interior word, ISO code, or dial code. A leading "+" is
 * ignored so both "91" and "+91" find India.
 */
export function searchCountries(q: string): readonly Country[] {
  const needle = q.trim().toLowerCase().replace(/^\+/, '');
  if (!needle) return COUNTRIES;
  return COUNTRIES.filter(([iso, name, d]) => {
    const n = name.toLowerCase();
    return (
      n.startsWith(needle) ||
      n.includes(' ' + needle) ||
      iso.toLowerCase().startsWith(needle) ||
      d.replace('+', '').startsWith(needle)
    );
  });
}
