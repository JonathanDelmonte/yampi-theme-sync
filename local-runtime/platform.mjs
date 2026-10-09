// Generic local implementations. These are not proprietary Yampi services.
export function twigHelpers(localAsset, previewAsset = value => String(value || '').startsWith('/preview/assets/') ? value : '/__local/placeholder.svg') {
  const rgb = value => {
    let hex = String(value || '#ffffff').replace(/^#/, '');
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    if (!/^[a-f0-9]{6}([a-f0-9]{2})?$/i.test(hex)) return [255, 255, 255];
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  };
  const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  const radius = value => ({square: '0px', rounded: '8px', round: '50%', pill: '999px'}[value] || '8px');
  const clean = value => String(value || '').replace(/\{\{|\}\}/g, '');
  return {
    filters: {
      bool_text: v => v === true || v === 'true' || v === 1 ? 'true' : 'false',
      boolean: v => v === true || v === 'true' || v === 1,
      json_decode: v => JSON.parse(v || '{}'),
      only_numbers: v => String(v || '').replace(/\D/g, ''),
      strip_mustache: clean,
      font_link: () => '/__local/empty.css',
      components_url: value => /\.css(?:$|\?)/.test(value) ? '/__local/style.css' : '/__local/empty.js',
      mask: (v, mask) => {let i = 0; const digits = String(v || '').replace(/\D/g, ''); return String(mask || '').replace(/#/g, () => digits[i++] || '');},
      youtube_url: () => '',
    },
    functions: {
      strip_mustache: clean,
      hex_to_rgb: v => rgb(v).join(', '),
      hex_to_rgba: (v, a) => `rgba(${rgb(v).join(', ')}, ${a ?? 1})`,
      relative_luminance: luminance,
      is_gray: v => {const [r, g, b] = rgb(v); return r === g && g === b;},
      color_is_light: v => luminance(v) > .5,
      is_color_contrasting: (a, b) => contrast(a, b) >= 3,
      get_contrasting_color: (v, foreground, alternative) => foreground ? contrast(v, foreground) >= 3 ? foreground : alternative || '#000000' : contrast(v, '#000000') > contrast(v, '#ffffff') ? '#000000' : '#ffffff',
      button_bg_color: (style, color) => /^(outline|outlined|contour|contorno)$/i.test(String(style)) ? 'transparent' : color || (/^(#|rgb|hsl|var\()/i.test(String(style)) ? style : '#222222'),
      font_weight: (family, weight) => ({regular:400,normal:400,medium:500,medio:500,semibold:600,bold:700,negrito:700}[String(weight ?? family).toLowerCase()] || Number(weight ?? family) || 400),
      type_border_radius: radius, type_border_radius_slide: radius, resolve_border_radius_by_type: radius,
      product_discount_tag_radius: radius,
      product_image_margin: () => '0px',
      social_media_fa: v => 'fa-' + String(v || '').replace(/[^a-z-]/gi, ''),
      thumborize: v => String(v||'').startsWith('/tema/assets/') ? v : previewAsset(v),
      vuetify: (value, name, key, interpolate) => {
        if (value) return String(String(key || '').split('.').reduce((item, property) => item?.[property], value) ?? '');
        const expression = 'data.' + String(name || 'product') + (key ? '.' + key : '');
        return interpolate === false ? expression : '{{ ' + expression + ' }}';
      },
      asset: localAsset,
    }
  };
}
