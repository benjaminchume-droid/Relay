import os
import subprocess

DENSITIES = {
    'mipmap-mdpi': {'icon': 48},
    'mipmap-hdpi': {'icon': 72},
    'mipmap-xhdpi': {'icon': 96},
    'mipmap-xxhdpi': {'icon': 144},
    'mipmap-xxxhdpi': {'icon': 192},
}

RES_DIR = os.path.abspath('android/app/src/main/res')

def generate_svgs():
    # Square / Squircle Icon
    square_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="108" height="108" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
    <clipPath id="squircle">
      <rect x="0" y="0" width="108" height="108" rx="22" ry="22" />
    </clipPath>
  </defs>
  <rect width="108" height="108" fill="url(#bg)" clip-path="url(#squircle)" />
  <path fill="#FFFFFF" fill-opacity="0.88" d="M36,36 C36,36 72,36 72,36 C72,54 54,72 36,72 Z" clip-path="url(#squircle)" />
  <path fill="#FFFFFF" d="M68,68m-8,0a8,8 0 1,1 16,0a8,8 0 1,1 -16,0" clip-path="url(#squircle)" />
</svg>'''

    # Round Icon
    round_svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="108" height="108" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
    <clipPath id="circle">
      <circle cx="54" cy="54" r="54" />
    </clipPath>
  </defs>
  <rect width="108" height="108" fill="url(#bg)" clip-path="url(#circle)" />
  <path fill="#FFFFFF" fill-opacity="0.88" d="M36,36 C36,36 72,36 72,36 C72,54 54,72 36,72 Z" clip-path="url(#circle)" />
  <path fill="#FFFFFF" d="M68,68m-8,0a8,8 0 1,1 16,0a8,8 0 1,1 -16,0" clip-path="url(#circle)" />
</svg>'''

    with open('/tmp/icon_square.svg', 'w') as f:
        f.write(square_svg)
    with open('/tmp/icon_round.svg', 'w') as f:
        f.write(round_svg)

def render_pngs():
    generate_svgs()
    for density, sizes in DENSITIES.items():
        dir_path = os.path.join(RES_DIR, density)
        os.makedirs(dir_path, exist_ok=True)
        
        icon_size = sizes['icon']

        # Render ic_launcher.png
        out_square = os.path.join(dir_path, 'ic_launcher.png')
        cmd_square = ['convert', '-background', 'none', '/tmp/icon_square.svg', '-resize', f'{icon_size}x{icon_size}', out_square]
        subprocess.run(cmd_square, check=True)

        # Render ic_launcher_round.png
        out_round = os.path.join(dir_path, 'ic_launcher_round.png')
        cmd_round = ['convert', '-background', 'none', '/tmp/icon_round.svg', '-resize', f'{icon_size}x{icon_size}', out_round]
        subprocess.run(cmd_round, check=True)

        print(f"Generated assets for {density}: icon({icon_size}x{icon_size})")

if __name__ == '__main__':
    render_pngs()
    print("All icons generated successfully!")

