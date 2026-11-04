/**
 * Unit test for the shared table comparator.
 *
 * The bug this guards: with the library's `alphanumeric` sort, a queue of
 * overdue tickets rendered "lewat 2h, lewat 10h, lewat 19h". The minus sign was
 * treated as text, so the magnitude was ignored and the least urgent ticket came
 * first. Remaining time is a signed number, so it must compare numerically.
 *
 *   node --experimental-strip-types --conditions=react-server \
 *     scripts/run-node-script.mjs scripts/verify-sort.mjs
 */
import process from 'node:process';

const { tableSortFn } = await import('@/lib/tableSort');

let pass = 0;
let fail = 0;

/** Compare through the real SortFn, the way the table would. */
function cmp(a, b) {
  return tableSortFn.sort(a, b, null, null, 'x');
}

function order(values) {
  return [...values].sort((a, b) => cmp(a, b));
}

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  ok   ${label} → ${a}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} → ${a}, harus ${e}`);
  }
}

const H = 3_600_000;
const M = 60_000;

console.log('\n== Angka bertanda (sisa waktu SLA) ==');

// The exact case that shipped broken.
check(
  'tiket lewat tenggat: yang paling lama lewat lebih dulu',
  order([-2 * H, -19 * H, -10 * H]),
  [-19 * H, -10 * H, -2 * H],
);

check(
  'campuran lewat tenggat dan belum',
  order([10 * H, -2 * H, 7 * M, -19 * H, 16 * M]),
  [-19 * H, -2 * H, 7 * M, 16 * M, 10 * H],
);

check('negatif kecil vs positif kecil', order([1, -1, 0]), [-1, 0, 1]);

check(
  'nilai tak hingga (tanpa tenggat) di akhir',
  order([Number.POSITIVE_INFINITY, -5, 3]),
  [-5, 3, Number.POSITIVE_INFINITY],
);

console.log('\n== Angka biasa ==');

check('integer', order([10, 9, 100, 1]), [1, 9, 10, 100]);
check('desimal', order([99.9, 100, 71.3, 99.98]), [71.3, 99.9, 99.98, 100]);

console.log('\n== Nilai kosong ==');

check('null dan undefined tenggelam', order([5, null, 1, undefined, 3]), [1, 3, 5, null, undefined]);
check('string kosong dianggap kosong', order(['b', '', 'a']), ['a', 'b', '']);
check('semua kosong stabil', order([null, null]), [null, null]);

console.log('\n== Teks ==');

check(
  'natural: angka di dalam teks',
  order(['Vol 10', 'Vol 2', 'Vol 1']),
  ['Vol 1', 'Vol 2', 'Vol 10'],
);

check(
  'abjad tanpa peduli huruf besar',
  order(['beta', 'Alpha', 'gamma']),
  ['Alpha', 'beta', 'gamma'],
);

check(
  'nomor tiket',
  order(['INC-202611-0010', 'INC-202611-0002', 'INC-202610-0011']),
  ['INC-202610-0011', 'INC-202611-0002', 'INC-202611-0010'],
);

console.log('\n== Campuran tipe dalam satu kolom ==');

// A column can hold a number for one row and a string for another (an asset with
// no SSL date renders "—"). It must not throw or reorder unpredictably.
check(
  'angka dan teks tidak melempar',
  (() => {
    try {
      cmp(5, 'teks');
      return 'aman';
    } catch {
      return 'melempar';
    }
  })(),
  'aman',
);

console.log(`\n== HASIL: ${pass} lolos, ${fail} gagal ==`);
process.exit(fail > 0 ? 1 : 0);
