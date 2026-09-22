/** Regenerates assets/tailwind.css from index.html. See package.json "build:css". */
module.exports = {
    content: ['./index.html'],
    theme: {
        extend: {
            colors: {
                benitobi: '#994639',
                tobi: '#724832',
                akakuchiba: '#C78550',
                shironeri: '#FCFAF2',
                gofun: '#FFFFFB',
                kesizumi: '#434343',
                haizakura: '#D7C4BB',
                ainezumi: '#566C73',
                aoni: '#516E41',
                ohdo: '#B68E55',
                benikaba: '#994639',
                'benikaba-dark': '#724832',
                'benikaba-light': '#FCFAF2',
                'benikaba-soft': '#F3EDE6',
                yamabuki: '#C78550',
                akane: '#994639',
                kohaku: '#C78550',
                kuriume: '#724832',
                neriiro: '#FCFAF2',
                haiku: '#D7C4BB',
                wasen: '#724832',
            },
            fontFamily: {
                sans: ['"PingFang TC"', '"Hiragino Sans CNS"', '"Noto Sans TC"', '"Microsoft JhengHei"', 'sans-serif'],
                brand: ['"PingFang TC"', '"Hiragino Sans CNS"', 'sans-serif'],
                serif: ['"PingFang TC"', '"Songti TC"', 'serif'],
                mono: ['"PingFang TC"', '"Hiragino Sans CNS"', 'sans-serif'],
            },
        },
    },
};
