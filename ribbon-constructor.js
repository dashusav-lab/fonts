
(function(){


/* =========================================================
   ROOT
========================================================= */

const root =
  document.getElementById(
    "packRibbonConstructor"
  );

if (
  !root ||
  root.dataset.ready === "1"
) {
  return;
}

root.dataset.ready = "1";


/* =========================================================
   ПЕРСОНАЛИЗАЦИЯ: ТЕКСТ / SVG
========================================================= */
const prLogoUpload = document.getElementById("prLogoUpload");
const prLogoFileName = document.getElementById("prLogoFileName");
const prLogoSize = document.getElementById("prLogoSize");
const prLogoRepeat = document.getElementById("prLogoRepeat");
const prLogoSizeValue = document.getElementById("prLogoSizeValue");
const prLogoRepeatValue = document.getElementById("prLogoRepeatValue");
const prCustomText = document.getElementById("prCustomText");
const prFontSelect = document.getElementById("prFontSelect");
const prFontPreview = document.getElementById("prFontPreview");
const prSelectedFontName = document.getElementById("prSelectedFontName");
const prTextPanel = document.getElementById("prTextPanel");
const prSvgPanel = document.getElementById("prSvgPanel");
const prSizeLabel = document.getElementById("prSizeLabel");

let prMode = "text";
let prUploadedSvgMarkup = "";
let prUploadedSvgRatio = 2.5;

/* =========================================================
   ШРИФТЫ ИЗ GITHUB
   Репозиторий: dashusav-lab/fonts

   Список строится автоматически из всех .woff2 в папке fonts/.
   Git Trees API не ограничивает список первыми 1000 файлами.
========================================================= */

const PR_FONT_REPO_OWNER = "dashusav-lab";
const PR_FONT_REPO_NAME = "fonts";
const PR_FONT_REPO_BRANCH = "main";
const PR_FONT_DIRECTORY = "fonts";
const PR_DEFAULT_FONT_FILE = "arial.woff2";

const prFontFiles = new Map();
const prLoadedFonts = new Set();
let prDefaultFontValue = "";

function prFontDisplayName(fileName) {
  return fileName
    .replace(/\.(woff2?|ttf)$/i, "")
    .split("-")
    .map(part => {
      const upper = {
        "fb":"FB", "mt":"MT", "bt":"BT", "itc":"ITC", "ms":"MS",
        "ui":"UI", "ocr":"OCR", "gd":"GD", "md":"MD", "lt":"LT",
        "bd":"BD", "bk":"BK", "cn":"CN", "hv":"HV", "wgl4":"WGL4",
        "no2":"No. 2", "sb":"SB"
      };
      return upper[part.toLowerCase()] ||
        (part ? part.charAt(0).toUpperCase() + part.slice(1) : part);
    })
    .join(" ");
}

// Read Git trees rather than Contents API (which stops at 1000 entries).
async function prFetchRepoFonts() {
  const api = "https://api.github.com/repos/" + PR_FONT_REPO_OWNER + "/" + PR_FONT_REPO_NAME;
  async function getTree(ref) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(api + "/git/trees/" + encodeURIComponent(ref), {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429
        ? "Лимит GitHub: повторите загрузку позже."
        : "Не удалось прочитать библиотеку (HTTP " + response.status + ").");
      const data = await response.json();
      if (!Array.isArray(data.tree) || data.truncated) {
        throw new Error("GitHub вернул неполный список шрифтов.");
      }
      return data.tree;
    } finally { clearTimeout(timeout); }
  }
  const rootTree = await getTree(PR_FONT_REPO_BRANCH);
  const directory = rootTree.find(entry => entry.type === "tree" && entry.path === PR_FONT_DIRECTORY);
  const files = [];
  async function walk(sha, prefix, suppliedEntries) {
    const entries = suppliedEntries || await getTree(sha);
    for (const entry of entries) {
      const path = prefix + entry.path;
      if (entry.type === "tree") await walk(entry.sha, path + "/");
      else if (entry.type === "blob" && /\.woff2$/i.test(entry.path)) {
        files.push({
          name: entry.path,
          path,
          sha: entry.sha,
          type: "file",
          download_url: "https://raw.githubusercontent.com/" + PR_FONT_REPO_OWNER + "/" +
            PR_FONT_REPO_NAME + "/" + PR_FONT_REPO_BRANCH + "/" +
            path.split("/").map(encodeURIComponent).join("/")
        });
      }
    }
  }
  if (directory) await walk(directory.sha, PR_FONT_DIRECTORY + "/");
  if (!files.length) {
    // Older uploads live directly in the repository root.
    await walk(null, "", rootTree.filter(entry => entry.type === "blob"));
  }
  if (!files.length) throw new Error("В репозитории пока нет опубликованных файлов WOFF2.");
  return files.sort((a, b) => a.path.localeCompare(b.path, "ru", { numeric: true }));
}

const prFontStatus = document.createElement("p");
prFontStatus.className = "pr-font-note";
prFontStatus.setAttribute("role", "status");
prFontStatus.setAttribute("aria-live", "polite");
prFontPreview.insertAdjacentElement("afterend", prFontStatus);
const prFontRetry = document.createElement("button");
prFontRetry.type = "button";
prFontRetry.className = "pr-secondary-button";
prFontRetry.textContent = "Повторить загрузку шрифтов";
prFontRetry.hidden = true;
prFontStatus.insertAdjacentElement("afterend", prFontRetry);
prFontRetry.addEventListener("click", () => {
  if (!prFontFiles.size) prPopulateFonts();
  else prRenderPersonalization();
});
let prFontRenderVersion = 0;

function prLoadRepoFont(fontValue) {
  if (!fontValue) return Promise.resolve(null);

  const item = prFontFiles.get(fontValue);
  if (!item || !item.downloadUrl) return Promise.resolve(null);

  if (item.loadedFamily) {
    return Promise.resolve(item.loadedFamily);
  }

  if (item.loadingPromise) {
    return item.loadingPromise;
  }

  const family = item.family;

  item.loadingPromise = (async () => {
    try {
      // FontFace.load() ждёт именно файл шрифта, а не успешный fallback.
      const face = new FontFace(
        family,
        'url("' + item.downloadUrl + '")',
        {
          style: "normal",
          weight: "400",
          display: "swap"
        }
      );

      const loadedFace = await face.load();
      document.fonts.add(loadedFace);

      // Дополнительно ждём, пока зарегистрированное семейство станет доступно.
      if (document.fonts && document.fonts.load) {
        await document.fonts.load('24px "' + family + '"', 'Лента Ribbon Ёё');
      }

      item.loadedFamily = family;
      prLoadedFonts.add(fontValue);
      return family;
    } catch (error) {
      item.loadingPromise = null;
      console.error("Не удалось загрузить шрифт:", fontValue, item.downloadUrl, error);
      throw error;
    }
  })();

  return item.loadingPromise;
}

const PR_EMBEDDED_FONT_METADATA = {"d4d0ebedb3db7bbc06fa458eef72362e1b989edf":{"cyrillic":true,"latin":true,"category":"unknown"},"4eb98dee23b27c13aced1fee3a3e3d2e32dcd742":{"cyrillic":true,"latin":true,"category":"unknown"},"ad896a6b51969570962be94df42ce6ca4c225836":{"cyrillic":true,"latin":true,"category":"unknown"},"b95068e712476169b8de9d19088a06277813f2b9":{"cyrillic":false,"latin":true,"category":"unknown"},"b6d621d453c6cdbf036439e3ca143a9bac8821a9":{"cyrillic":true,"latin":true,"category":"unknown"},"9d37d642ecc76857bc6f3307bb5202e84855ce42":{"cyrillic":true,"latin":true,"category":"unknown"},"84ad79c6451f1a66467099224207320c066d64be":{"cyrillic":true,"latin":true,"category":"unknown"},"bd57504747508eed3a93cfc56c32efe84c20d70b":{"cyrillic":false,"latin":false,"category":"unknown"},"8e81ee81ff0de0e654570c677b52a1c1f8eb1878":{"cyrillic":false,"latin":true,"category":"unknown"},"bd5899d98521fd8ed9ecdb8c58f21723a39dec2b":{"cyrillic":true,"latin":true,"category":"unknown"},"758791ba4d93396e5a4d4782595dd52325275a3e":{"cyrillic":true,"latin":true,"category":"unknown"},"42e6d29caf5db9af7b6cb82fe906d27fc2ec97f0":{"cyrillic":false,"latin":true,"category":"sans"},"dd4b8997c00ae9862d1ec06a9ec2b442b6a761bc":{"cyrillic":true,"latin":true,"category":"unknown"},"962a714b12b3413f7c833b72974298d8b69f922d":{"cyrillic":false,"latin":true,"category":"unknown"},"294d35c5c9b1f9b01864dc6137457123e1b86563":{"cyrillic":false,"latin":true,"category":"unknown"},"376bdb440552eac718b15ef331f586bcd1954d80":{"cyrillic":true,"latin":true,"category":"unknown"},"98c1b4e2841259e9ba6152504b1a0dba2ce47557":{"cyrillic":true,"latin":true,"category":"unknown"},"968b284ad31cc54ee1fc6ff4d4453ae021765a89":{"cyrillic":false,"latin":true,"category":"sans"},"7242048383be5efe1131cf7094b5e98970f6b479":{"cyrillic":true,"latin":true,"category":"unknown"},"fd2e4e98c69d3c51fe3b94ede780e9bb8756ec81":{"cyrillic":false,"latin":true,"category":"sans"},"db084accb944b94a448fb662d4a53b6f039f7b87":{"cyrillic":true,"latin":true,"category":"unknown"},"02b46d4f766e86c8b37c5e8a3dbb4b069e72345b":{"cyrillic":false,"latin":true,"category":"unknown"},"e39aa8d83e172080fc6d772c49c04ce212383845":{"cyrillic":false,"latin":true,"category":"unknown"},"f7e04a19b7f4af2f491b5e752561b0f0e3955c16":{"cyrillic":true,"latin":true,"category":"unknown"},"ab0b12fde8935ace599b938d0d7f11f169e15b1e":{"cyrillic":false,"latin":true,"category":"unknown"},"1545e0ea2eabb7c6f2e408c1dcac07e94ad004fd":{"cyrillic":true,"latin":true,"category":"unknown"},"872ab4652ba6bb0aba0a9a1756c6afcfbaedb8fe":{"cyrillic":true,"latin":true,"category":"unknown"},"668232d051e8a54a1758eb8755855965d7a8bc16":{"cyrillic":true,"latin":true,"category":"unknown"},"6f9e76684d2c67a7fb02dd5775cb04875f156b9b":{"cyrillic":true,"latin":true,"category":"unknown"},"6fffaf3dc7ef813693d0f15fa8297c3c532e4275":{"cyrillic":true,"latin":true,"category":"unknown"},"8019bfc35871478a0fb89c62fbed8ac428acc952":{"cyrillic":false,"latin":true,"category":"unknown"},"f0a5cf75a4170da337495e0161bf8e0b15c00474":{"cyrillic":false,"latin":true,"category":"sans"},"25fe978c17bd77f49c1a3342005ea7041363fa50":{"cyrillic":false,"latin":true,"category":"sans"},"7785afa7f65d41589c910320a646fa34f9e1725b":{"cyrillic":true,"latin":true,"category":"sans"},"b59f496af931ad4efd59c35282480bae5aad3037":{"cyrillic":true,"latin":true,"category":"sans"},"485e88b8f9185080cbfa61d8ec3bdd91cc1eaa45":{"cyrillic":true,"latin":true,"category":"unknown"},"1da3ea1669cabf13727d597fd89ef163f95b2b92":{"cyrillic":false,"latin":true,"category":"serif"},"2592d1c07b6005b9f96fffe30a489101cb444bda":{"cyrillic":false,"latin":true,"category":"symbol"},"704e3af055c3bd87aa2556d0ac35794b6f993101":{"cyrillic":false,"latin":true,"category":"symbol"},"fc973948593a21c1bea137bfba12e2ca30bdc877":{"cyrillic":true,"latin":true,"category":"handwriting"},"4dbc5ea151c075a3a2e84cd97c374ce29da2b054":{"cyrillic":true,"latin":true,"category":"handwriting"},"552850d60340c0ef8429290acbafe068c0b84cd3":{"cyrillic":true,"latin":true,"category":"unknown"},"a13b51c2c7a7fa76cd35bd3b6a0f6012050eaf6e":{"cyrillic":false,"latin":true,"category":"handwriting"},"196f456e62b68cc09482f7b390ef666b1f231482":{"cyrillic":false,"latin":true,"category":"unknown"},"77497e1881720512c21b6cb7e61da1cb80ee46a1":{"cyrillic":false,"latin":true,"category":"unknown"},"f6f13337a42a4cd65319b2b7c25ac14cad669f29":{"cyrillic":false,"latin":true,"category":"unknown"},"a12a6ea941dfd8bff22b73e9af9a490f07e3084a":{"cyrillic":false,"latin":true,"category":"unknown"},"48732cdfb7b121628d63ccb2ad30d16170ef0976":{"cyrillic":false,"latin":true,"category":"unknown"},"ed1fb322cef67fc9b8bc42c5bad84f4dd8969dbf":{"cyrillic":false,"latin":true,"category":"unknown"},"709bd40484d60eab15631f3d78fe2aca7de0057f":{"cyrillic":false,"latin":true,"category":"unknown"},"45fe11c3e87413607bc84fcd2e6cd5f436e93a93":{"cyrillic":false,"latin":true,"category":"unknown"},"51e83781b7589a8a5df1958a30e4ecb50ab8e7aa":{"cyrillic":false,"latin":true,"category":"unknown"},"49dc113bfad2eebeddaef5f197ddf0a3970daf2e":{"cyrillic":false,"latin":true,"category":"unknown"},"162d804aa8f1bcfe4013523a9e4b57a1ad6cec38":{"cyrillic":true,"latin":true,"category":"sans"},"1d8273f40175330a90e921698a762c7996589530":{"cyrillic":true,"latin":true,"category":"sans"},"bde81de261c990dd2ab10e9be21a114d2c4619db":{"cyrillic":false,"latin":true,"category":"unknown"},"46a6ec57325abd31912ba5f7bf2dbf6fe46c60d0":{"cyrillic":true,"latin":true,"category":"sans"},"8bc89a9e8a64b47e8a0632069456fb44e5ed619a":{"cyrillic":false,"latin":true,"category":"sans"},"27b95de3088c287c0f31f946162b22c57677d20e":{"cyrillic":false,"latin":true,"category":"sans"},"3d77246364b589d301cb28fe9513880e25f2ed02":{"cyrillic":false,"latin":true,"category":"sans"},"2cbfaf06505923b239ca95f52d38d267fe9c156c":{"cyrillic":false,"latin":true,"category":"unknown"},"3594dc794776207a65bcdc44840464c8d0a27a2a":{"cyrillic":false,"latin":true,"category":"sans"},"3c8d48682c096614ffb9dadd7969c38075453dc7":{"cyrillic":false,"latin":true,"category":"sans"},"3e1093977d21e41d378477bb2a2a3b448f4d65f0":{"cyrillic":true,"latin":true,"category":"sans"},"973a312cda282f2d8551a40b1c0b3f24f983d27f":{"cyrillic":false,"latin":true,"category":"sans"},"3afd0717b31bd195931731562d785ab7a4c2b1a9":{"cyrillic":true,"latin":true,"category":"sans"},"923f206bc7d90367159865ff496d8de880af1249":{"cyrillic":true,"latin":true,"category":"serif"},"6f27085f9d39d0181363fa932fb92d369e4b4b28":{"cyrillic":false,"latin":true,"category":"unknown"},"da86a90eed86fabb2f1af8459075d06fdc369333":{"cyrillic":false,"latin":true,"category":"unknown"},"4abac9349f1bf9bfb4e8b4654fcd5948ea72a603":{"cyrillic":false,"latin":true,"category":"sans"},"ef606d7cf618610823b0c45d49fe221d07c2b43c":{"cyrillic":true,"latin":true,"category":"unknown"},"180ab6489bcf34d5b3413d995c00c12254f8ce85":{"cyrillic":false,"latin":true,"category":"sans"},"7283636040cc4808afe712b8c58e59a0f7c7c347":{"cyrillic":true,"latin":true,"category":"sans"},"f26cbf01ed9fda94a74f7dd6ee4bf5a137970cd7":{"cyrillic":true,"latin":true,"category":"sans"},"25b20e651aa8d4ab3be9907b235f0a6d24a5308c":{"cyrillic":true,"latin":true,"category":"sans"},"d60762f6d0f27a7e1ec1aabcf46f3a4ae6c712f4":{"cyrillic":true,"latin":true,"category":"sans"},"d334bd8dfea9756acf91cd3f5b3b003de163df2a":{"cyrillic":false,"latin":true,"category":"sans"},"989cf674913596c068b5a063a07051ad172c5e54":{"cyrillic":false,"latin":true,"category":"sans"},"5e2f1042daa0023c45a582365aaca09793e22026":{"cyrillic":false,"latin":true,"category":"sans"},"c1cd2e959c89682c0a43fbd00b18b219d2437a6a":{"cyrillic":false,"latin":true,"category":"sans"},"3aed9f9c41aa5a882b287758af621eb3a3117bee":{"cyrillic":false,"latin":true,"category":"unknown"},"38b8401c2dd820a3552e66ec1200ca777dacd18f":{"cyrillic":false,"latin":true,"category":"unknown"},"79438fb7b7140c5607b471b262dffde7f01bb95f":{"cyrillic":true,"latin":true,"category":"sans"},"393b180c67eaa1db0a228e846412ebed5e1be382":{"cyrillic":true,"latin":true,"category":"sans"},"dafb13cc6d3168e8f33e417a02fac569d0ece461":{"cyrillic":true,"latin":true,"category":"handwriting"},"2bb1a839272bfcbaad13d722ec034b6c65622aa5":{"cyrillic":true,"latin":true,"category":"unknown"},"d961e27f75b83094981fa39b0e9934bf1452da8c":{"cyrillic":true,"latin":true,"category":"unknown"},"17d9ee6486f3322c3789f2918b609885a4a0b9c9":{"cyrillic":false,"latin":true,"category":"unknown"},"0b73e64990e3b047b6dead8af8d69c4e26821018":{"cyrillic":false,"latin":true,"category":"handwriting"},"baa1b5ae21cd1d0af808f6a2ab97a419a83b40cc":{"cyrillic":true,"latin":true,"category":"decorative"},"4dfbef5723effe928abe485e6a429e8cb4e78be0":{"cyrillic":true,"latin":true,"category":"unknown"},"c29e3666050e66b1c3712922b076a90a3aeb258c":{"cyrillic":true,"latin":true,"category":"unknown"},"d346e3cf10f292e2686598a75f66cc99e27d6e99":{"cyrillic":false,"latin":true,"category":"unknown"},"958fdbb645e5f54a52322abd2b8caa44750b586d":{"cyrillic":true,"latin":true,"category":"sans"},"142ade95bda9bd3f617070294cde47bfc29f5bfa":{"cyrillic":true,"latin":true,"category":"sans"},"393b358dd63be3f2f31b1ee217d12560ffa648f8":{"cyrillic":true,"latin":true,"category":"sans"},"7db4403dc135886d4c58fb81f0faa0a41b6285dd":{"cyrillic":true,"latin":true,"category":"sans"},"6d46377b62b2e152ac5f60e0b75e55dc6f03ba73":{"cyrillic":false,"latin":true,"category":"unknown"},"09073efc74922bb73cceaca04a79d2032b4f9873":{"cyrillic":false,"latin":true,"category":"sans"},"16bbfce6231c04ff052f78bc8e5ca8fca0534732":{"cyrillic":false,"latin":true,"category":"unknown"},"6fdc72c9c3459d84e23d00aa35ef42e1767afad4":{"cyrillic":true,"latin":true,"category":"unknown"},"cf3334d04b187506f1714e3dbedb418779c5564e":{"cyrillic":true,"latin":true,"category":"unknown"},"6f4a7b988eefcc26fe52e742f246165bafe4b75f":{"cyrillic":true,"latin":true,"category":"sans"},"b8f93b1d7bac8a780d460ad8b9c50c98f05498fa":{"cyrillic":true,"latin":true,"category":"decorative"},"81b2d68d72fe44ae11ba96c1cbb8abdebc79e8ee":{"cyrillic":true,"latin":true,"category":"sans"},"55a92165a0c7bfd1fcffc79a6a47eb686c96f882":{"cyrillic":true,"latin":true,"category":"sans"},"593c4c29337fe64b40a2a30200992a0840c22104":{"cyrillic":true,"latin":true,"category":"unknown"},"c67faae209d9877e26bba689dfc3601ea3c39873":{"cyrillic":true,"latin":true,"category":"unknown"},"8465dbe1f09708fa9791c1964f7f66c760dc69f5":{"cyrillic":true,"latin":true,"category":"unknown"},"e560366bd5d66f2bcbe78d054e8711403ddb75ac":{"cyrillic":true,"latin":true,"category":"unknown"},"910ea0b7ff7f93d7f9e0a5cc5822de7fc620af57":{"cyrillic":false,"latin":true,"category":"sans"},"d00f72ae517069d4a77399ceaa17db2e7680ab97":{"cyrillic":false,"latin":true,"category":"sans"},"3195f5ac5de73d9aa93aeb39ee0454f87cf73ee5":{"cyrillic":false,"latin":true,"category":"unknown"},"40c8b88bdcc25e7cf9b49285ab303b1a94fc065a":{"cyrillic":true,"latin":true,"category":"decorative"},"db1e74b8c64a82db7cc0c4c3fe43fbfc7435f799":{"cyrillic":true,"latin":true,"category":"sans"},"248c00a655dd6d7078e7cdef4fe5070222aa9a35":{"cyrillic":true,"latin":true,"category":"sans"},"8b6f2534b36410c0d8419f98129b376d6491390a":{"cyrillic":true,"latin":true,"category":"sans"},"c1e111d8c109bb5a66b9aafb628520fcf4deaa0d":{"cyrillic":true,"latin":true,"category":"sans"},"7d01c06cc31adf5fc29783f16a0e204dfb71000d":{"cyrillic":true,"latin":true,"category":"sans"},"a7d1a084e1ec5d5700c4b75d7a068dfe91603cf7":{"cyrillic":true,"latin":true,"category":"sans"},"592eb394df639779bda7a55b8a1a1d12b4de51fc":{"cyrillic":true,"latin":true,"category":"sans"},"9949a9c6e448c9eaa0a9c836c4bb876818629c18":{"cyrillic":true,"latin":true,"category":"sans"},"c0301b455fb053b0de14e365ae00ba20833c782d":{"cyrillic":true,"latin":true,"category":"decorative"},"80e3436f2c79297e48e11445626287dbad9945d2":{"cyrillic":true,"latin":true,"category":"decorative"},"23f0fcb96c6fae8ec1fdbd01b24cf7db9f3576d1":{"cyrillic":true,"latin":true,"category":"decorative"},"5e5564b63af734b6347ae874c3f38bc17acfad58":{"cyrillic":true,"latin":true,"category":"unknown"},"7bb2020dc39fdefa525952d31f2ec58faeb174f9":{"cyrillic":true,"latin":true,"category":"sans"},"2e3cc169607c71a2cfa46145f75a475534bf82a1":{"cyrillic":true,"latin":true,"category":"unknown"},"0addc2de65b1d4a694909e15f68b14a0e7d70aa3":{"cyrillic":false,"latin":true,"category":"unknown"},"578c902fcf8683b93c79dd105eb7a7d702aefcda":{"cyrillic":true,"latin":true,"category":"unknown"},"a925313f583aac68bb6b537d76045137be5f3104":{"cyrillic":false,"latin":true,"category":"unknown"},"5947f8ea6b5aec5d9353c54f4925b8c52d5f407b":{"cyrillic":false,"latin":true,"category":"serif"},"4e427fcb21fc62714341fac6c110466fc91787e7":{"cyrillic":false,"latin":true,"category":"serif"},"f6c26fd8e1a414935a75f6c940c120faf78d239d":{"cyrillic":false,"latin":true,"category":"serif"},"3493c4293e837851cecf869d434ead77bbb67938":{"cyrillic":false,"latin":true,"category":"serif"},"d09cedd4e4444947b0bca75f96a945114b63d9b1":{"cyrillic":false,"latin":true,"category":"serif"},"295f834157c47f10e217df90035f35d3f5ef9ad3":{"cyrillic":false,"latin":true,"category":"serif"},"70806c92e8f7cea3a864b048d9b27e7c2c7991fc":{"cyrillic":true,"latin":true,"category":"unknown"},"cc60ad20be7bb64edf7c53dfe286b1a51dca3227":{"cyrillic":false,"latin":true,"category":"serif"},"623a7d95d7e83bb03bb665bf5b103612b1b2ef28":{"cyrillic":true,"latin":true,"category":"unknown"},"446cd1a24535b000e80839600328a4e44e40fd7e":{"cyrillic":false,"latin":true,"category":"unknown"},"5648eea0a130e9c90a8dc1d4ddf78ac99a9aefc9":{"cyrillic":true,"latin":false,"category":"unknown"},"7bddacc5660a1bd15bf474a3cd9dc2aa623869bd":{"cyrillic":true,"latin":true,"category":"unknown"},"1184253855141af66dc95fbfde13be5231235919":{"cyrillic":false,"latin":true,"category":"serif"},"320a3b72384cf8cec32bd9014e5747007426ed9e":{"cyrillic":false,"latin":true,"category":"serif"},"d3bf7ee062715be60a32fff8d8c77e65edf7ce22":{"cyrillic":false,"latin":true,"category":"serif"},"a47531790a588fc7f902a2004a3fb742257ec0eb":{"cyrillic":false,"latin":true,"category":"serif"},"365ae0210cc5d7aeaa80b95f4b5575c2ebcc91fb":{"cyrillic":false,"latin":true,"category":"serif"},"74361052fcecc0b1e9e0c07e74d385bce506bb64":{"cyrillic":false,"latin":true,"category":"serif"},"7ed95fecd21620c3d29d0e5e2ff99b182bcf565d":{"cyrillic":false,"latin":true,"category":"serif"},"a800e4d5e885ae8c020dafd0321f67ddb3df85cf":{"cyrillic":false,"latin":true,"category":"serif"},"f44583ee3839524686ccbc88c24b21516feab0d1":{"cyrillic":true,"latin":true,"category":"serif"},"905831944085f8333c701acb02632a1a2fe97070":{"cyrillic":true,"latin":true,"category":"sans"},"9cde7ba5ce065919415052095cc54fd7038202bd":{"cyrillic":true,"latin":true,"category":"sans"},"8dd49b5ac4b3300c70e845eb39e1f8f87303db9b":{"cyrillic":false,"latin":true,"category":"serif"},"5a6c57c144eff7fbd1058171608b39ad26d72d8e":{"cyrillic":false,"latin":true,"category":"serif"},"d8edef7cfa858fd106648b0fe1b5820e96f69fc5":{"cyrillic":false,"latin":true,"category":"serif"},"4db84a75534e9d14750e43e3230fa841b08e7243":{"cyrillic":false,"latin":true,"category":"serif"},"980da38e28ad142e6b4cec4d0a247e26c96c73d7":{"cyrillic":true,"latin":true,"category":"sans"},"acc1d49f8d9636a4495731c3db98a40f8cd6c757":{"cyrillic":true,"latin":true,"category":"serif"},"22991803327a5e8248afd98e5174822d87d3f98c":{"cyrillic":true,"latin":true,"category":"serif"},"a48b72468ef37d980ec6ea86a8ccf7cb51190c13":{"cyrillic":true,"latin":true,"category":"serif"},"3c573c54be0188443b82e9deacbd97d69796e05f":{"cyrillic":false,"latin":true,"category":"unknown"},"94229b95f2fc26088825057ac995716ebd89f523":{"cyrillic":true,"latin":true,"category":"serif"},"502d41c764b9946f589ebcbba722c7a6a08ca916":{"cyrillic":true,"latin":true,"category":"unknown"},"2b60bf38b930595b5dce3f383ff3900633a36383":{"cyrillic":true,"latin":true,"category":"unknown"},"2b05bceee3869f19d20ee277430eef1b183a886c":{"cyrillic":true,"latin":true,"category":"unknown"},"1a0315d7fcaff4a5ce7d0728b3fd8235df6900ad":{"cyrillic":false,"latin":true,"category":"decorative"},"a8fb6eb10f815844da0e0a7e7288b65b74db618b":{"cyrillic":false,"latin":false,"category":"decorative"},"f55b20ae23fbefb259020d6bad3d658fb02a96e1":{"cyrillic":true,"latin":true,"category":"unknown"},"45bcda87194125899bf2d8281a8e573d83d4285e":{"cyrillic":false,"latin":true,"category":"sans"},"fdcabda20dab1ae411e8182f8c92449b622710b4":{"cyrillic":false,"latin":true,"category":"unknown"},"d83f35d8530e003a387483f8c99e3cbea0ce180b":{"cyrillic":true,"latin":true,"category":"sans"},"b5fc624cb34ff8166fce36617bf4fa4583c552fa":{"cyrillic":true,"latin":true,"category":"sans"},"32bc2c8fc82901b1b6ac46adddab0c70dee34058":{"cyrillic":false,"latin":true,"category":"unknown"},"8a84231482570e976ea2dac343b815eab73ffdad":{"cyrillic":false,"latin":true,"category":"unknown"},"a9aadf7b09b77cca0d7dbcbe85d983638313926f":{"cyrillic":false,"latin":true,"category":"unknown"},"4875f6d60212c507508da401ae2475698bc13047":{"cyrillic":false,"latin":true,"category":"serif"},"b05f6cde2c143920260fdcfb445aa6bc853366ff":{"cyrillic":false,"latin":true,"category":"serif"},"d0a29e6657cf7304751f9627706340136d4d748f":{"cyrillic":false,"latin":true,"category":"serif"},"b2beeca277956f5bd73b12e20b863023162ba579":{"cyrillic":false,"latin":true,"category":"serif"},"56d21e12aa23d63c16c2bc0016bf411868f2dbe9":{"cyrillic":true,"latin":true,"category":"sans"},"fd607636054fdff56782016d41e3bf80e3b15259":{"cyrillic":false,"latin":true,"category":"sans"},"80a14bea1d9f460501a79e0d96a7c9ce45240e6b":{"cyrillic":false,"latin":true,"category":"sans"},"4d9c6c7fe30c836cee3e0843c9b64a6b71e24f6d":{"cyrillic":false,"latin":true,"category":"sans"},"29f0d78d375cd4f147a0c733696fdb9445ca9a1d":{"cyrillic":false,"latin":true,"category":"sans"},"aefec1e24c5b946797b2271cfa14e438d6bf67f4":{"cyrillic":false,"latin":true,"category":"sans"},"83a527819f44722e19ed083bfde4041be59a372e":{"cyrillic":false,"latin":true,"category":"unknown"},"a75b2f93cf6d3979bc38553a9cda7d49f50155c4":{"cyrillic":false,"latin":true,"category":"sans"},"22a52526e45fceed36b857f564f6516886e8d556":{"cyrillic":false,"latin":true,"category":"sans"},"4deb3c030890bba2a70742855042241cb4d114e1":{"cyrillic":false,"latin":true,"category":"unknown"},"8943d00ed92609971e63848490fb542581433a81":{"cyrillic":false,"latin":true,"category":"unknown"},"a5353b66bd043db141acde998f716888ac7e1738":{"cyrillic":true,"latin":true,"category":"unknown"},"344851f5cb613903c30c4d8ed04cfd2f345d73a2":{"cyrillic":true,"latin":true,"category":"unknown"},"0401227194fba71d922d03f9457f3f95b03bb1ad":{"cyrillic":false,"latin":true,"category":"unknown"},"74a88945b04d49b085de5e0b1a73580f2df51b1f":{"cyrillic":false,"latin":true,"category":"unknown"},"326c820faf9626e8edd5f43b8ce7e620292dc0b8":{"cyrillic":true,"latin":true,"category":"unknown"},"98bd0570a4d0252dca535e7b5d1994f0516240b0":{"cyrillic":true,"latin":true,"category":"unknown"},"27df73d9594ac55b064c5764f19da868ce6cf4c9":{"cyrillic":true,"latin":true,"category":"handwriting"},"6b8c978da9650c645a6f9645f3c872e41599b724":{"cyrillic":true,"latin":true,"category":"handwriting"},"aeddafb617549637ae2886ae7a6a42b6ae641909":{"cyrillic":true,"latin":true,"category":"unknown"},"e60fcc5e89041a6363ade2237b6f772e0d35ad5f":{"cyrillic":false,"latin":true,"category":"unknown"},"9ffaacc984f70e46ebbbc780a99d4d4859d91d29":{"cyrillic":false,"latin":true,"category":"decorative"},"ffe6fef578e0b2175acd0d2520f13d2712f7bfad":{"cyrillic":true,"latin":true,"category":"decorative"},"0bb313a1fdf9fa59bda1c0231b666233492eba5e":{"cyrillic":true,"latin":true,"category":"decorative"},"6bab61204eea8f6e274c677ffd003cf9c8656c67":{"cyrillic":false,"latin":true,"category":"unknown"},"bf61b95fa24e428f3f65b22d2430c5121ed41501":{"cyrillic":false,"latin":true,"category":"sans"},"57be5eb3d1a9e562f99a1d9fe362990baa0a1932":{"cyrillic":true,"latin":true,"category":"sans"},"4b44cfca92c527eff6f497418230045da656cbb6":{"cyrillic":true,"latin":true,"category":"unknown"},"0000080c584eccc6105e3aeb9093391fe85d37c2":{"cyrillic":false,"latin":true,"category":"handwriting"},"eaad0575c1716fe9fbcaf227f4446cdd71163cd5":{"cyrillic":false,"latin":true,"category":"handwriting"},"dbb6b25ab507b8de3d5a62bebdc7a4884db7ce3e":{"cyrillic":true,"latin":true,"category":"decorative"},"e2a634ca37557d704d63b26afa1eeab1e0e184b6":{"cyrillic":false,"latin":true,"category":"unknown"},"63ac280d5639aa9175ffc044bce63c2bf21bec73":{"cyrillic":false,"latin":true,"category":"decorative"},"a2c33f7f0c4fd126a394de05007213799f8cb1a9":{"cyrillic":false,"latin":true,"category":"decorative"},"1bc414a3752076a365378c662f02c5c9c8534aaa":{"cyrillic":false,"latin":true,"category":"decorative"},"1840ade2070a9c15ba2e760e9f8bb2b62c07ba94":{"cyrillic":false,"latin":true,"category":"decorative"},"40510d514b66d6588481438258625e484da3c7ff":{"cyrillic":false,"latin":true,"category":"unknown"},"7dfc1c65b2cae156824748eb5e16b46e7c070837":{"cyrillic":true,"latin":true,"category":"unknown"},"8de429f2b0e97ef1a965840192729a6c31442197":{"cyrillic":true,"latin":true,"category":"unknown"},"62d6f4ef65470c0d61a01cea5d3ef3cd241c9553":{"cyrillic":true,"latin":true,"category":"unknown"},"4e6cb59396a247216d60df5112336683c7600321":{"cyrillic":true,"latin":true,"category":"unknown"},"6b075608f9bb246ca361f84b2fc2ab6c0903441d":{"cyrillic":true,"latin":true,"category":"unknown"},"d2f2b4386916c77209d5fe0d05833a9ba3ff4ad4":{"cyrillic":true,"latin":true,"category":"unknown"},"9213e15716b00b7a9ef13763a3eaf62681ddadc1":{"cyrillic":true,"latin":true,"category":"serif"},"300fc6f7c71a28f431bb6d15ae856f20c0525472":{"cyrillic":true,"latin":true,"category":"unknown"},"d33544dea4313eff78d6d24d5891890316d0822f":{"cyrillic":true,"latin":true,"category":"serif"},"e6fb5df72f799dcf9f8da5ebc7118b3f4298105a":{"cyrillic":true,"latin":true,"category":"serif"},"ef8840d445ad5377339003981a3d9a5d70a7b433":{"cyrillic":true,"latin":true,"category":"unknown"},"fc69782e516cfe73005bf5166c030df268ef2ebc":{"cyrillic":true,"latin":true,"category":"unknown"},"8fb361e3112480a014601c6119e6c2fcd6d3e7b3":{"cyrillic":true,"latin":true,"category":"serif"},"03ebbfa92f0415420841b48864f19220725ca687":{"cyrillic":true,"latin":true,"category":"serif"},"330b6583422ae4a08f0102c13588c50c715b08f6":{"cyrillic":true,"latin":true,"category":"unknown"},"4ce5f43df22c107f5a70e988bf951b9b668658e7":{"cyrillic":true,"latin":true,"category":"serif"},"eaf3b177865c9da507d79d3dcbedcc710b6db1cc":{"cyrillic":false,"latin":true,"category":"unknown"},"6537abd9c8b5582b2a372fab363ea9891d949083":{"cyrillic":true,"latin":true,"category":"unknown"},"2714c69af431ed4503fa3329a4ae454d4d6a580d":{"cyrillic":true,"latin":true,"category":"unknown"},"bbddac1303e13ac885d157dc0212ac592ab9ca9f":{"cyrillic":true,"latin":true,"category":"unknown"},"dd741c52f8c5e0285bf710006fef8b5f4f45f6e0":{"cyrillic":true,"latin":true,"category":"unknown"},"5a3d2eade92ee7705ee65ad6d5a76518f0b5781d":{"cyrillic":true,"latin":true,"category":"unknown"},"1bb10df9879f51f352c83c1a1d6515bbce85a0eb":{"cyrillic":true,"latin":true,"category":"unknown"},"f0a84c083a46d2121c714cbfb5c5ddbffea281d7":{"cyrillic":true,"latin":true,"category":"unknown"},"d91e7e7b17a6b35c8a307d89bead9e6eb2f01eb6":{"cyrillic":true,"latin":true,"category":"unknown"},"e63527050cf72e6fae390a0a6f49fcb6a5849e3b":{"cyrillic":true,"latin":true,"category":"unknown"},"8fe6ac7b32b390cabd94dcc91ae344b87164783e":{"cyrillic":false,"latin":true,"category":"unknown"},"2dcdba7823b39d05dd6ac0932a492bd7a23521e7":{"cyrillic":true,"latin":true,"category":"handwriting"},"907409662c636b151e887a9ebd8e584d81cbb64b":{"cyrillic":false,"latin":true,"category":"unknown"},"e8b53a5ed1475afd8fcac875c5b12a80a6d60e29":{"cyrillic":true,"latin":true,"category":"unknown"},"32d39ab6adfea9af730139de5de0d1cc84749151":{"cyrillic":false,"latin":false,"category":"decorative"},"da239e4b5d435fe3e7af17cda758536caaf3925e":{"cyrillic":true,"latin":true,"category":"unknown"},"1fa02f1d72f6eb8d2ba925dc6bb2f57a8d16b3e8":{"cyrillic":true,"latin":true,"category":"unknown"},"64e7db7d487c70f5035dbe6c4df4c4cac32ccea6":{"cyrillic":false,"latin":true,"category":"unknown"},"065b2ad5ecef502b9bbc8e281ba37c48c060b756":{"cyrillic":true,"latin":true,"category":"unknown"},"242bd52bbdc0870862774752852a530d1b44e663":{"cyrillic":false,"latin":true,"category":"serif"},"0bc17d3012082b0a6478999d4f84637266b4c4cd":{"cyrillic":true,"latin":true,"category":"sans"},"fb4aae4f470cc9ab2e62493b6219b33fb3c9d2bf":{"cyrillic":false,"latin":true,"category":"symbol"},"41e39ad98b061d649ed56a0aa8cab94d893a603a":{"cyrillic":false,"latin":true,"category":"unknown"},"afae4cf60780c7515a1a66c742b8c72d64a8ce3c":{"cyrillic":true,"latin":true,"category":"serif"},"2cd1292d9b8eac1a059ddda19715a4179762228e":{"cyrillic":true,"latin":true,"category":"serif"},"3c8a7817e4a57c52e1e214d6ccf189670263a1a3":{"cyrillic":true,"latin":true,"category":"serif"},"38e379d0250ace2a293295d949044f58728e9e73":{"cyrillic":true,"latin":true,"category":"serif"},"7414ec5097ba700835c124fe15803f83ea027ba2":{"cyrillic":true,"latin":true,"category":"serif"},"a8cbdafccbe310c5963dd6341278d908324ccdbe":{"cyrillic":true,"latin":true,"category":"serif"},"cf94103ae2d69f16650bf1b93f2cecb09ab1eb69":{"cyrillic":false,"latin":true,"category":"serif"},"26569178968f2d31860456ce8d32c7718d5de8d3":{"cyrillic":false,"latin":true,"category":"serif"},"99036aa37fca0c138e8e993fc2bdc500d31cc2ce":{"cyrillic":false,"latin":true,"category":"serif"},"bb0c4cac3958f6bc27874b80b3e9abdf9da9ddc4":{"cyrillic":false,"latin":true,"category":"serif"},"fe3295848274e87ee38a35c3067a33f88441ac24":{"cyrillic":false,"latin":true,"category":"serif"},"d474d1f5b6c3d22e1b96875e92c05974d4c0a852":{"cyrillic":false,"latin":true,"category":"serif"},"ec50ba62049c0a7660b9416ed343855e7c489c9d":{"cyrillic":false,"latin":true,"category":"serif"},"36e4a85818ad1d08c7d3cc58100c91543d1d1548":{"cyrillic":false,"latin":true,"category":"serif"},"fb069e50d5b1313d389b31fe4259c4e6ef8df28f":{"cyrillic":true,"latin":true,"category":"unknown"},"23ec85de069e098401291318b6445062701cf3c9":{"cyrillic":true,"latin":true,"category":"unknown"},"d8188476e513c9b72fca20c2611fa34452c56856":{"cyrillic":true,"latin":true,"category":"unknown"},"50aa45f2b9edc06f5bc2660bea6e6f6f2df685ad":{"cyrillic":true,"latin":true,"category":"unknown"},"c31be9cebb290b8a235094262ff95ffca080f162":{"cyrillic":true,"latin":true,"category":"unknown"},"ab5de79bd2c0c631f48ca9bd7031963f798ae2a7":{"cyrillic":true,"latin":true,"category":"unknown"},"4b5edfedce9c886666e619bf837fb845b9bf713b":{"cyrillic":true,"latin":true,"category":"unknown"},"4d86a11df684b6d198e4e60f451226736758cbe4":{"cyrillic":false,"latin":true,"category":"unknown"},"884aaa8ddf11b1cd0501c284f67e6589d2a3c714":{"cyrillic":false,"latin":true,"category":"unknown"},"8bd04f7c4b5016166bd2d7b2d8ace65c4a9403f1":{"cyrillic":false,"latin":true,"category":"unknown"},"6387976aad16253973d118821e6ec18958b206c3":{"cyrillic":false,"latin":true,"category":"handwriting"},"d1d01543db65d8d985c06b4589c50b8ec75c0323":{"cyrillic":true,"latin":true,"category":"monospace"},"9d0de1b138e460fee188fb3fa0a47e052539eb12":{"cyrillic":true,"latin":true,"category":"monospace"},"cdf73be788b59070b4c6e50213187d290d972632":{"cyrillic":true,"latin":true,"category":"monospace"},"82e55a8e7ed9d6136c592b5b6385eb4c206335b3":{"cyrillic":true,"latin":true,"category":"monospace"},"5e64f7f85e9a203c293031e7df5ba82d0317189f":{"cyrillic":true,"latin":true,"category":"unknown"},"fa9fcab02ff5aa7b24aba0b245680cddde68fa95":{"cyrillic":true,"latin":true,"category":"unknown"},"5cfbd2293915d7aa0ad90661daa924ed5ed69ff3":{"cyrillic":true,"latin":true,"category":"serif"},"23a8b3e0076b8784485feca7bdd6daf2d00de2b6":{"cyrillic":true,"latin":true,"category":"serif"},"60da8044e05179899a690ec40c9714decd405ccc":{"cyrillic":true,"latin":true,"category":"serif"},"00685170baf6c4a44a98b12900e4aea40082d71a":{"cyrillic":true,"latin":true,"category":"serif"},"2f775a09a698c8c627c01e6996cb4c6160cc8563":{"cyrillic":false,"latin":true,"category":"unknown"},"3571e76ab8db823a3816c942c9a9c56ce203dbb7":{"cyrillic":false,"latin":true,"category":"unknown"},"d8e70940cd53bff5114e78bd0eff1efb8895341a":{"cyrillic":false,"latin":true,"category":"sans"},"04e032d177ea83d751270680f222806dcb9a5029":{"cyrillic":false,"latin":true,"category":"sans"},"9713d7830d8264bc57e1579d5896a33114c41a11":{"cyrillic":false,"latin":true,"category":"sans"},"bd77560650bf73660c092125549c921be4f4fb93":{"cyrillic":false,"latin":true,"category":"sans"},"27456872ebc518d5688cfde4e86cc98da3231195":{"cyrillic":false,"latin":true,"category":"sans"},"8ca6549b4a181e819ce172310c24bf07ea547371":{"cyrillic":false,"latin":true,"category":"unknown"},"49812568a471e9a7752ae4323019623e77ed0a21":{"cyrillic":false,"latin":true,"category":"sans"},"423cc08f29eb269589086db1f12f333af6037f38":{"cyrillic":false,"latin":false,"category":"unknown"},"d9ecf12e249d25f3ab75aa46571edec5c8ada72f":{"cyrillic":true,"latin":true,"category":"unknown"},"a4f9a3f45824f356084e445987f6f4844428648f":{"cyrillic":true,"latin":true,"category":"unknown"},"8785eee62199dc2caef1d5bc42ecd1d842d8ec3a":{"cyrillic":true,"latin":true,"category":"handwriting"},"61276fff16c57f0991abfbdcf1559991a84b0821":{"cyrillic":true,"latin":true,"category":"handwriting"},"550d7250e2cd62488f0a33ea83935a81c9b38555":{"cyrillic":false,"latin":true,"category":"sans"},"da918c07080e4da1f0a3eb13b1883f6101f3639c":{"cyrillic":false,"latin":true,"category":"handwriting"},"7a0dc53f77fc153a3457590df43879c2f6d73eff":{"cyrillic":false,"latin":true,"category":"unknown"},"a05d459fd9c320e001483840cd01ce2b4a88d016":{"cyrillic":false,"latin":true,"category":"unknown"},"37db4f0fdcb9d4a5dabcf4928aec9d11783810f4":{"cyrillic":true,"latin":true,"category":"unknown"},"b498537e978da60c7f71aa8c4efe1929bba4b66d":{"cyrillic":true,"latin":true,"category":"unknown"},"5367f0648b4623f58d2c024439307c1ff9161b30":{"cyrillic":true,"latin":true,"category":"unknown"},"9fcbf45b77f7fe73a3f3c800ea144ff011482528":{"cyrillic":true,"latin":true,"category":"unknown"},"ed14108d93129e07e2922ea4bb6c6ffd7dad24ae":{"cyrillic":true,"latin":true,"category":"unknown"},"2e16511fbf528b845fa3ab3b4e449e1eb74296cf":{"cyrillic":true,"latin":true,"category":"unknown"},"84792b1714e6c91e9702c02f8276df141d14d594":{"cyrillic":true,"latin":true,"category":"unknown"},"46a9cd0f8f1c43c6b6a28863638ebe517fdf7595":{"cyrillic":true,"latin":true,"category":"unknown"},"04d0253b3002e0ee5b188070f84059e14cdb6e9d":{"cyrillic":true,"latin":true,"category":"unknown"},"52dbd4192c20d9ecdd5d5d20e4ef5a9cc4397bff":{"cyrillic":true,"latin":true,"category":"unknown"},"2de91da3fad18ef09f71e6f56ff1b10727ac964a":{"cyrillic":true,"latin":true,"category":"unknown"},"403ff0bc253ed171ab73367c614c8c012fee53c1":{"cyrillic":true,"latin":true,"category":"unknown"},"221cbe2c1bef2cf4bca74620591fbec686baa21e":{"cyrillic":false,"latin":false,"category":"unknown"},"dc2538e837edde16f4d3e82c3e666dd8fe2f63a5":{"cyrillic":false,"latin":true,"category":"unknown"},"edb51251d4de040c58b279ed2b7257bd33b94ce6":{"cyrillic":false,"latin":false,"category":"unknown"},"fdf659a831eb67e2323959bb3b9e581992476dbf":{"cyrillic":false,"latin":false,"category":"unknown"},"a11b439c3297e4f325e59f158aacf9242a0d6d99":{"cyrillic":false,"latin":true,"category":"unknown"},"8f176f81d2251cd3ed8ee77eab06afe22baaffa2":{"cyrillic":true,"latin":false,"category":"unknown"},"6802946ca26de24fa1eb1cefc4a24826089f8ea3":{"cyrillic":true,"latin":true,"category":"unknown"},"b3ada3461aee359f0d6d76c6d7ae5c6db670804c":{"cyrillic":true,"latin":true,"category":"unknown"},"121d4f2e01884e4d435a128989fa7b2147365240":{"cyrillic":true,"latin":true,"category":"sans"},"e969116efc15cfa668ebae3d0b25e1efd485fd0c":{"cyrillic":true,"latin":true,"category":"sans"},"69537f18c0c7d51a372293e0a54fe44374da0ad7":{"cyrillic":false,"latin":true,"category":"unknown"},"931d483456d175054d87aebd977eeceae83520cd":{"cyrillic":true,"latin":true,"category":"sans"},"36236d9138c3e9463a7c275e4b7e936257f932e4":{"cyrillic":true,"latin":true,"category":"sans"},"384e81a7aceb8cd9063ee7542eb2a7ba97ae868d":{"cyrillic":true,"latin":true,"category":"sans"},"32305432fd6303aa87c2379beeaa0daf79592179":{"cyrillic":true,"latin":true,"category":"sans"},"016a38ac14b09ffb8f76dd9ae255eefe6194e57b":{"cyrillic":true,"latin":true,"category":"sans"},"d4be7d04a72fb2d21c9293ea6e625afd9cc86211":{"cyrillic":true,"latin":true,"category":"sans"},"53913f2caf69309322aeac3685f24697d5baef90":{"cyrillic":true,"latin":true,"category":"sans"},"446a7b53e0f1b7621a7505318499247f50a4428d":{"cyrillic":true,"latin":true,"category":"sans"},"a086ea1c7617f67015a578a09583e60258ee40b6":{"cyrillic":true,"latin":true,"category":"sans"},"c452182718e92abb657bb561e3e63ebdd6fb083c":{"cyrillic":true,"latin":true,"category":"sans"},"d57e4f034b7b34ef996336760d0a02b7953e8b4c":{"cyrillic":true,"latin":true,"category":"sans"},"0b27955f3aa6ca54b57e476da4bdf77d1136a56f":{"cyrillic":true,"latin":true,"category":"sans"},"da286faf662998a1c50b680c5f47244492d65fe9":{"cyrillic":true,"latin":true,"category":"sans"},"62800e6a36667ebaadfa6811c19fd383c6187605":{"cyrillic":true,"latin":true,"category":"sans"},"503799e22a5b9c92787b037929e6b93d8803a967":{"cyrillic":true,"latin":true,"category":"sans"},"8b9b6604cf477b0b7cb998dafa3448bca3c8acc9":{"cyrillic":true,"latin":true,"category":"sans"},"2a69d89c674ad10300d789ef83bddeac22027a16":{"cyrillic":true,"latin":true,"category":"sans"},"9d1766875b7e86183411e3ee99e008c7e5016ccf":{"cyrillic":true,"latin":true,"category":"handwriting"},"71d0eb15da3502345596c9707a78fa66c88ff1b5":{"cyrillic":true,"latin":true,"category":"unknown"},"628f90882a05d2b8834591deae5e189e98f3b8ca":{"cyrillic":true,"latin":true,"category":"sans"},"35d60b381db4b9f57602c165ec1b679460d770de":{"cyrillic":true,"latin":true,"category":"unknown"},"0e9c48c4b49ca15f412a803f317a995be2d0e2f2":{"cyrillic":true,"latin":true,"category":"unknown"},"54061311b19f54db1ef094ea64be72506d794745":{"cyrillic":false,"latin":true,"category":"sans"},"4796f9cf0669e4abe311804c1655d230c5034086":{"cyrillic":false,"latin":true,"category":"unknown"},"daef936b49cb556cc166ae3a92d6490728df9bcc":{"cyrillic":true,"latin":true,"category":"serif"},"2e40e16ed116e1f0b56c3f2139c8ac6d3c3b6aa9":{"cyrillic":true,"latin":true,"category":"serif"},"325c3f98e388713fb048ba625b7c222b5fbde082":{"cyrillic":false,"latin":false,"category":"unknown"},"443bd25a11fdb0a5151fc7dccc60052f05884dbe":{"cyrillic":false,"latin":true,"category":"unknown"},"cf08af2a6e09570d5cec347de9bde1561d02092c":{"cyrillic":false,"latin":true,"category":"unknown"},"91c9c7e0bc13194e1b8d6bdae479c02f85a0e6d8":{"cyrillic":false,"latin":true,"category":"unknown"},"5f47ff27296fe12085312b56b3c424ad9d6d1ebb":{"cyrillic":false,"latin":true,"category":"unknown"},"d06863069fdd022a3fcb4fa748a47762b07fcf8b":{"cyrillic":true,"latin":true,"category":"unknown"},"6ba78a1a79e03aeb821488466f6c3a218dc16f7b":{"cyrillic":true,"latin":true,"category":"unknown"},"2536eb4d6664f56982e253c91aca13edc6bb9208":{"cyrillic":true,"latin":true,"category":"unknown"},"090dbb4dc088454a33540cb4767b236a32467db6":{"cyrillic":true,"latin":true,"category":"unknown"},"76bcbb3ba3b4b6be2a7062606e6a11e6b79addd6":{"cyrillic":true,"latin":true,"category":"unknown"},"38a965225eea9e0526c55be1861a4edb1ff49e01":{"cyrillic":true,"latin":true,"category":"unknown"},"20a0ec3cc0f86df4f01ba7941648857f441fc4ae":{"cyrillic":true,"latin":true,"category":"sans"},"d5e1b07b3d064a37babef7b488b2e47919d56a57":{"cyrillic":true,"latin":false,"category":"decorative"},"917cd21d775f38e47f49f8358da0a3d4d833aaa8":{"cyrillic":true,"latin":true,"category":"decorative"},"e7af8532ece754ef81a98fff00ecdf29c145051a":{"cyrillic":false,"latin":true,"category":"unknown"},"25ba81060385f7c1397dc9914d1fc47efd186f44":{"cyrillic":true,"latin":true,"category":"sans"},"96752fcf1121a0c1d6886a581731a4a3f3a70368":{"cyrillic":true,"latin":true,"category":"sans"},"d1f0d356740fc00cd797d6179a065775ffd56738":{"cyrillic":true,"latin":true,"category":"sans"},"a2ac68b7d4442b35a4935761b1a02f6e12b2fd9e":{"cyrillic":true,"latin":true,"category":"sans"},"d911dc881f44853f642f5e447033797f242e5464":{"cyrillic":false,"latin":true,"category":"unknown"},"de8f558c67cba1fc39baa999c9e1e66216b64833":{"cyrillic":true,"latin":true,"category":"unknown"},"979fc886d611511094e32bc1baed9f3930913e41":{"cyrillic":true,"latin":true,"category":"unknown"},"981de87cf0833f369fe39457053523556e80ce1d":{"cyrillic":true,"latin":true,"category":"unknown"},"3d487757d990f5263dfdbee105c847a81d7afa0d":{"cyrillic":true,"latin":true,"category":"unknown"},"f42c876408a96049ec53a88f6bc60bfcc5148e51":{"cyrillic":true,"latin":true,"category":"unknown"},"c1a5423cca5563af971f80ee9fb27e250a03c468":{"cyrillic":true,"latin":true,"category":"unknown"},"be0fa1f7a32f916a2edf4ced8fe4529b0afdf1c5":{"cyrillic":true,"latin":true,"category":"unknown"},"bd3ada58f38c117b65234720e473869305df4fa6":{"cyrillic":true,"latin":true,"category":"unknown"},"7a704aa0ba46577a9e9fc6b759fecb5fe7cc5973":{"cyrillic":true,"latin":true,"category":"unknown"},"e95b3792314477d495897dd8ff37f066628ff557":{"cyrillic":true,"latin":true,"category":"unknown"},"90e8455f611226b054d93e8cddc3b32cfa1e330e":{"cyrillic":true,"latin":true,"category":"unknown"},"4b6d85fba9a0285ff761788a86fc5175cfdc9850":{"cyrillic":true,"latin":true,"category":"unknown"},"c987261b8e773f76ee33b0686d62bca0dece6cbe":{"cyrillic":true,"latin":true,"category":"unknown"},"c7f708f74ee73e5bfc092450b2e610fe2b3a43a9":{"cyrillic":true,"latin":true,"category":"unknown"},"5050d07ce966df73866c6d773336f1e9b7cb90d8":{"cyrillic":true,"latin":true,"category":"unknown"},"dbb39fe0f2afbd7eb5a186585df43b2eb8ed4817":{"cyrillic":true,"latin":true,"category":"unknown"},"01b3bcd5a40ecce50b3c07782cec2dedf18e3942":{"cyrillic":true,"latin":true,"category":"unknown"},"43b447db3a050fcfc7087ee7e13f2d26a24a8f28":{"cyrillic":true,"latin":true,"category":"unknown"},"3241681e398498a5063af5637cc2224c4e122479":{"cyrillic":true,"latin":true,"category":"unknown"},"b3900c9114b354f6f1374091f1cc08ac6005da6e":{"cyrillic":true,"latin":true,"category":"unknown"},"5b19db71a30659e371630016409d8ed0e2a52fb0":{"cyrillic":true,"latin":true,"category":"unknown"},"f7af927f0c6916622ce423ec4f2368b087e93c98":{"cyrillic":true,"latin":true,"category":"unknown"},"260e70598566dea43f26155d22b19f16d48e3f20":{"cyrillic":true,"latin":true,"category":"unknown"},"d4b32d8df5982c67f068bba2da339d0ba3e48912":{"cyrillic":true,"latin":true,"category":"unknown"},"0e7ad183578417efdae4cba05ea183d5914f1d91":{"cyrillic":true,"latin":true,"category":"unknown"},"f4159843cf7f5372f832f13c774db880adc7354c":{"cyrillic":true,"latin":true,"category":"unknown"},"3277ce4d9c8357eab70233c44669cd94bd9f6010":{"cyrillic":true,"latin":true,"category":"unknown"},"6ef01fad56a89257529a090935a0f2c4101ad0eb":{"cyrillic":true,"latin":true,"category":"unknown"},"a94e0a6e3942892262e975fa2b71b915f617d90d":{"cyrillic":true,"latin":true,"category":"unknown"},"b0ab4169e211974b11c0c9bb2dd966f79dbe1e32":{"cyrillic":true,"latin":true,"category":"unknown"},"a0d1c08a30d060830f4072813388737ee92857ef":{"cyrillic":true,"latin":true,"category":"unknown"},"000500716e1147e91a600b25e0f612df0e06d58e":{"cyrillic":true,"latin":true,"category":"unknown"},"1134f174cb0715991cce9abc9c30aa34346a4629":{"cyrillic":true,"latin":true,"category":"unknown"},"bd0c3cfa1e70c291ccf9f59b85455c8ad7922a95":{"cyrillic":true,"latin":true,"category":"unknown"},"21266892353875c949a8f479921a5632c03bc319":{"cyrillic":true,"latin":true,"category":"unknown"},"d0c9a9454a9d939cbe129156258ca66a0557b663":{"cyrillic":true,"latin":true,"category":"unknown"},"8cabf134fadb6d1340cf9948db7469a19a73984b":{"cyrillic":true,"latin":true,"category":"unknown"},"e404b5772590bac73c374d994b9287b56dcbfa91":{"cyrillic":true,"latin":true,"category":"unknown"},"9414cca4940dc735cdef8da9087db12c2692353f":{"cyrillic":true,"latin":true,"category":"unknown"},"2d5b64b16b07addd998b8922468254473c488d7c":{"cyrillic":true,"latin":true,"category":"unknown"},"e29f58d9023680412b690aec23a0a8a6b5dedec4":{"cyrillic":true,"latin":true,"category":"unknown"},"216d4763b15f0c399d2b74ad27d6af44fe32484e":{"cyrillic":true,"latin":true,"category":"unknown"},"531f789b32423db67cfb8ff47e0ff71cab4c71dc":{"cyrillic":true,"latin":true,"category":"unknown"},"150e859465cbad23b4f0c248fe0b1f03e3e0d871":{"cyrillic":true,"latin":true,"category":"unknown"},"b40357627051e2dcff02aaa12db140b28a658ae9":{"cyrillic":true,"latin":true,"category":"unknown"},"7452100fe5552d292f16ccf2a0f0a4193ec17149":{"cyrillic":true,"latin":true,"category":"unknown"},"3029e4c45f7726214fcd4b23865ed5912987ddce":{"cyrillic":true,"latin":true,"category":"unknown"},"713ddbcfed6ffdb2e244c680ab67fa73badb055d":{"cyrillic":true,"latin":true,"category":"unknown"},"9347b3145f4e01c3076df8c2de1e692b64f28ae7":{"cyrillic":true,"latin":true,"category":"unknown"},"bb6ce582833636410c410598dca6877ce729f415":{"cyrillic":true,"latin":true,"category":"unknown"},"b079ede3e31589d0e6ae9bc5548915efd35d6456":{"cyrillic":true,"latin":true,"category":"unknown"},"237dcd26cec61134efe839311640cb19a99d385b":{"cyrillic":true,"latin":true,"category":"unknown"},"3a5e3dc854ed210d9d7f621e70a8f075b4125758":{"cyrillic":true,"latin":true,"category":"unknown"},"3fffaa0a3aac65a54ddd710e09a10404b080b12f":{"cyrillic":true,"latin":true,"category":"unknown"},"5f229c5ab036e857b63b3f533d00812c86ded64f":{"cyrillic":true,"latin":true,"category":"unknown"},"c8dc5e4c3496c802adc6a292d545ccbfa0e9f8f7":{"cyrillic":true,"latin":true,"category":"unknown"},"38d0385acea1d72678858ec9eee12f0fc9efdf9a":{"cyrillic":true,"latin":true,"category":"unknown"},"d1882f77c25aef739be0eefa3c343aa937cd9c5e":{"cyrillic":true,"latin":true,"category":"unknown"},"f05875389dae40a5e3f61aa7c141f92996b5a423":{"cyrillic":true,"latin":true,"category":"unknown"},"80ec2c17b281bb7104eb0996efa2b31064218e6a":{"cyrillic":true,"latin":true,"category":"unknown"},"33390c9809ce2918638d3e01a13c7bd0bb66e7bf":{"cyrillic":true,"latin":true,"category":"unknown"},"857680d845cbd6f29da3b1988a5e8940c1271d76":{"cyrillic":true,"latin":true,"category":"unknown"},"4c25fef73d0714e3f8d7e2858c82e2936c549628":{"cyrillic":true,"latin":true,"category":"unknown"},"755c4072238b676d30dbf0413c45c3a1e4ffb84d":{"cyrillic":true,"latin":true,"category":"unknown"},"213fbb441795773499650191272a2749ea5bd8c0":{"cyrillic":true,"latin":true,"category":"unknown"},"511a3b5c785b7d37558dc1111eb17f2811a5ddef":{"cyrillic":true,"latin":true,"category":"unknown"},"1b18de50b1a04ce21b927abe9fde1ae17bf1fd09":{"cyrillic":true,"latin":true,"category":"unknown"},"6b011be40da314d4d1802530775604cea18665f8":{"cyrillic":true,"latin":true,"category":"unknown"},"d4973d461075f522865472275df01c04a5a690bd":{"cyrillic":true,"latin":true,"category":"unknown"},"e15c7b8c113e8f406c880cc37e3f161f2d639392":{"cyrillic":true,"latin":true,"category":"unknown"},"f6477dba6071aeab0564a1ae588ea68aaadc27e8":{"cyrillic":true,"latin":true,"category":"unknown"},"3384a819b27a5f5c45e5625eb1f7a705ef13795e":{"cyrillic":true,"latin":true,"category":"unknown"},"a9f32bbc723af6880156c6eb6ad22a67c64640e8":{"cyrillic":true,"latin":true,"category":"unknown"},"d0ea28565014554d668b95796e87103466c3b616":{"cyrillic":true,"latin":true,"category":"unknown"},"cfb385cc8d075ddf6aa5cfddd1d865fc21bbe63f":{"cyrillic":true,"latin":true,"category":"unknown"},"24af421d919b369d8759e0e6cafc42777650dbd8":{"cyrillic":true,"latin":true,"category":"unknown"},"fbd5af591b9eeda6be0338b90e46e35856347138":{"cyrillic":true,"latin":true,"category":"unknown"},"b69ca28c72f6cb814d279ef116753efdaaebe9f8":{"cyrillic":true,"latin":true,"category":"unknown"},"93435b8a77cac13e818c2c2a10905ebab86b5e4b":{"cyrillic":true,"latin":true,"category":"unknown"},"465ba904fb97d53597eff93ba39f923d7c6f5e6e":{"cyrillic":true,"latin":true,"category":"unknown"},"c1717e8c39ce62a83d280f8166c052f651b146c4":{"cyrillic":true,"latin":true,"category":"unknown"},"7bb5412d591580333a8a61bbe7d0d539870c94f9":{"cyrillic":true,"latin":true,"category":"unknown"},"47a8669747a75695bc7c49603bad0d3b31b1c284":{"cyrillic":true,"latin":true,"category":"unknown"},"aecb6b065d8e1662c1051f5d8ed114a53e9ede6a":{"cyrillic":true,"latin":true,"category":"unknown"},"ab682e4f597b105b5d444a916adf1fd74f479231":{"cyrillic":true,"latin":true,"category":"unknown"},"9eaf5c0ae8e2468105a3772cb3eeeb66ab54d64e":{"cyrillic":true,"latin":true,"category":"unknown"},"bf4380ac188ab3bf8ff5c2aaf8e91cf50528bd3f":{"cyrillic":true,"latin":true,"category":"unknown"},"c239dd9b3619e2c83898ece9b0bc110b27665999":{"cyrillic":true,"latin":true,"category":"unknown"},"a20ba44e60216bd261288cdec7c6436d335c7a4b":{"cyrillic":true,"latin":true,"category":"unknown"},"694bf28cade48d5bc70cdd017cc7157d85211b5b":{"cyrillic":true,"latin":true,"category":"unknown"},"603d3022b1d23401dd347516c113d05fbe0e69a3":{"cyrillic":true,"latin":true,"category":"unknown"},"4d15dc5552e3ffb1285b3c6e052b13c7430153c1":{"cyrillic":true,"latin":true,"category":"unknown"},"2699e6a8a3acc24300d215f020c6a8f18fe5e446":{"cyrillic":true,"latin":true,"category":"unknown"},"4a24596ab1672098c0f83c6e9103b5046613fea5":{"cyrillic":true,"latin":true,"category":"unknown"},"2dddeba9e905653c0da3cc4559edcc97e3738719":{"cyrillic":true,"latin":true,"category":"unknown"},"bcecc207e735ab0372ed2dae6a9cca2b0619befe":{"cyrillic":true,"latin":true,"category":"unknown"},"f25fdc30f07c10fb7613236ca669d4603223a6f7":{"cyrillic":true,"latin":true,"category":"unknown"},"be926b90ad98ceef788c109d0d66aa5b8de3501f":{"cyrillic":true,"latin":true,"category":"unknown"},"b89b3fd59b16210a41928931f742836e841de73c":{"cyrillic":true,"latin":true,"category":"unknown"},"bf09bd2a2be7e4f12f45c97f9bf34fa4727ab69a":{"cyrillic":true,"latin":true,"category":"unknown"},"763a2a0083eddd513401df76406005f36a68e6e8":{"cyrillic":true,"latin":true,"category":"unknown"},"5d32fbb026b6c9d0d62e243de57ed480cfabd918":{"cyrillic":true,"latin":true,"category":"unknown"},"c60962f07eb7629982f80250b497852578656eac":{"cyrillic":true,"latin":true,"category":"unknown"},"f27e3009b5f099b2d09db7961994f67aee24f838":{"cyrillic":true,"latin":true,"category":"unknown"},"f9c5df6b1dec4bc3c63e7f99e31be9059543d34d":{"cyrillic":true,"latin":true,"category":"unknown"},"e69a81ab5b65f7659432957ac18b0ef72f4c73ea":{"cyrillic":true,"latin":true,"category":"unknown"},"d3f22043739e2cd647ca18cde4eb1df5308e389a":{"cyrillic":true,"latin":true,"category":"unknown"},"dfa7b17c73c37c0b993857e192971292e7ecd6b2":{"cyrillic":true,"latin":true,"category":"handwriting"},"cc66746c19ee1a5dad4a8d11856c4cbe6bb649df":{"cyrillic":false,"latin":true,"category":"unknown"},"820459afdce36592df81093c41b2f38fc734122f":{"cyrillic":false,"latin":true,"category":"handwriting"},"6b80cd2be9549de4954f3433c075ae86ed313337":{"cyrillic":false,"latin":true,"category":"unknown"},"2680f5dfbdc05b016f7a521d0fc0c47068f9e8f3":{"cyrillic":true,"latin":true,"category":"unknown"},"7d7bd481bfffc894acc5804ea93777a210de19ba":{"cyrillic":false,"latin":true,"category":"unknown"},"5537710a474ef23ee1226fdfd11bdc2bad20d38a":{"cyrillic":true,"latin":true,"category":"unknown"},"b9d04a4a85f88f16a32d35483b896d3e1b8dc854":{"cyrillic":true,"latin":true,"category":"unknown"},"36b99a10103a7179f0b76add6fddb29d58433b6b":{"cyrillic":true,"latin":true,"category":"unknown"},"62cb5a5cecbd4f1965de86c95fca80b5fcca230f":{"cyrillic":true,"latin":true,"category":"unknown"},"961c6ab2011e5d20e18c219ec224aa4072d4db6c":{"cyrillic":false,"latin":true,"category":"unknown"},"801ccb42df4fac8da8c22a97db3f76c971675154":{"cyrillic":false,"latin":true,"category":"sans"},"c099a97de585950164cee44c75247c761dafd0ab":{"cyrillic":false,"latin":true,"category":"sans"},"2d7cdbc443c25ffc5ea819f348c809785e23c397":{"cyrillic":false,"latin":true,"category":"sans"},"44f8bfd6cf198314db2e7d4b2835022ddca79100":{"cyrillic":false,"latin":true,"category":"sans"},"f6f74b0c84dc5ff613b29059b0b06c6fff978751":{"cyrillic":false,"latin":true,"category":"sans"},"b1fc443f9e7a43f0f63217c7e5a2aa1adc8ab4e4":{"cyrillic":false,"latin":true,"category":"sans"},"cc0bca52063aa91f52e73b42b22e0401ad21e783":{"cyrillic":false,"latin":true,"category":"sans"},"afd13e52658acf5713496065f5b1b456dec92dcd":{"cyrillic":false,"latin":true,"category":"sans"},"e61c129d9e8c4f108704f6f8ca09ff0e1609ec22":{"cyrillic":true,"latin":true,"category":"sans"},"e508f289bf5a901458cce590c3ab9e9304d279a5":{"cyrillic":true,"latin":true,"category":"sans"},"92dda64707c5954f5867edf2066f844adc7851dd":{"cyrillic":true,"latin":true,"category":"sans"},"995235df13b6a7582c809746b3e4733411a09c81":{"cyrillic":true,"latin":true,"category":"sans"},"45e22c3b52bbbd73638322963816408616f84625":{"cyrillic":true,"latin":true,"category":"sans"},"1842688525a260f267120318d71817d0f721cbe9":{"cyrillic":true,"latin":true,"category":"sans"},"2c0f47c8935c0da6fc939cb2f23ecec5c7ca2246":{"cyrillic":true,"latin":true,"category":"sans"},"a11154bf252b33119cfe6aaea58642e9a6df7504":{"cyrillic":true,"latin":true,"category":"sans"},"3cbbe58bec62989170013f10543aa938af528b6c":{"cyrillic":true,"latin":true,"category":"sans"},"50dabf6ff2938a3ff561a8ddf1ac3fc553841719":{"cyrillic":true,"latin":true,"category":"sans"},"fdcee1b1997949b29f2ed079e4bbe13adc75e7ca":{"cyrillic":true,"latin":true,"category":"sans"},"8fa93afd383b1760e6c44941449ab7ef88bd004a":{"cyrillic":true,"latin":true,"category":"sans"},"56fee181d60ec6cfc3b60b189721a18644bcc212":{"cyrillic":true,"latin":true,"category":"sans"},"618c4fbfb2b40c0d0bd60fa4f8f1b7300680282e":{"cyrillic":true,"latin":true,"category":"sans"},"58eaa4c5ec4e03c5ad9df490f8db9720141e077f":{"cyrillic":true,"latin":true,"category":"sans"},"730ee4ea09388da822b1b0612dbd1593381aadcb":{"cyrillic":true,"latin":true,"category":"sans"},"a7e7252db741c3ec4dc7bde58271e602f4063c54":{"cyrillic":false,"latin":true,"category":"sans"},"6cd585405bc9d5e0503ea7f4b91e629181086f28":{"cyrillic":false,"latin":true,"category":"sans"},"3a7653cd6d2a6d8d86ecfd0a5f43e61cc2ef9518":{"cyrillic":false,"latin":true,"category":"sans"},"d5d8ff327cc39a9b161cc968b90cc5f5ac8992a1":{"cyrillic":false,"latin":true,"category":"sans"},"865ab6c7def6edf24ed4b0cdf6c0b46447ba2534":{"cyrillic":false,"latin":true,"category":"sans"},"335e08b72e6606a9b2c60fe486b57cc1b85af816":{"cyrillic":false,"latin":true,"category":"sans"},"e0c7e20a1cf1988f1d6e705cfdcaa1017076f6d7":{"cyrillic":false,"latin":true,"category":"sans"},"b7ab372fe2539bf322dd9d0992a7b0025510cf7b":{"cyrillic":false,"latin":true,"category":"sans"},"0e117c63f764ec38cdb4291e452ac88db624fb23":{"cyrillic":false,"latin":true,"category":"sans"},"78ad9cb9138398e69d612e5f5de7ce238e873c84":{"cyrillic":false,"latin":true,"category":"sans"},"b0ea8c51c8a938d73348e4849a1d961dadf45aa0":{"cyrillic":false,"latin":true,"category":"sans"},"c6f7f83c03bde2ea53ba65c1889970ad3fd5410f":{"cyrillic":false,"latin":true,"category":"sans"},"2679f89da22cd994010501cab2ea69183dee6076":{"cyrillic":false,"latin":true,"category":"sans"},"9637303e808d22af83663603948bc47272bcc3aa":{"cyrillic":false,"latin":true,"category":"sans"},"81d772e05fce9198ea2afe09b0274cc9a7cb3c12":{"cyrillic":false,"latin":true,"category":"sans"},"bef634b008959734e4f166afd55a0abeb787f0b2":{"cyrillic":false,"latin":true,"category":"sans"},"3d4f6cc7ec29b78086ac2fb9880c9c0d96dda60c":{"cyrillic":false,"latin":true,"category":"sans"},"425ec3a918c94448f66b45b96799254605da16d7":{"cyrillic":false,"latin":true,"category":"sans"},"629b95850405df96726172e361a69abd9940fdc2":{"cyrillic":false,"latin":true,"category":"sans"},"6eaa20e622e1183f44f0c604abe00db7e91d78d2":{"cyrillic":false,"latin":true,"category":"sans"},"a0e469db5a9744ec85e82c03ac8bcd3524e2d1bb":{"cyrillic":false,"latin":true,"category":"sans"},"ca6c7c6b66b4ce19c1fef7272329a1f286b283de":{"cyrillic":false,"latin":true,"category":"sans"},"eccdb2322136779f599a0491489459f42c50abbb":{"cyrillic":false,"latin":true,"category":"sans"},"656a52fdd829598a5cb50220dda717f2b90a2720":{"cyrillic":false,"latin":true,"category":"sans"},"99b1d1db0c842da808113f2f89cc893b7935a144":{"cyrillic":false,"latin":true,"category":"sans"},"0969581ca6162899f3febc66eca98851e03f99a0":{"cyrillic":false,"latin":true,"category":"sans"},"dabbb7ed6e308d4276545ccc2d5530520d4a73fa":{"cyrillic":false,"latin":true,"category":"sans"},"c6760471d520b7d90981bcc2db9cb38ed3f22d2b":{"cyrillic":false,"latin":true,"category":"sans"},"22f052a3068df1eed3d65d241c5cdabef773c892":{"cyrillic":false,"latin":true,"category":"sans"},"a3e86598bbcdbb546da1bd14adcd81eb96231463":{"cyrillic":false,"latin":true,"category":"sans"},"daff98584ad2581a8194e4d4fab8f91bae5a3fed":{"cyrillic":false,"latin":true,"category":"sans"},"05c78c438613e306edc3673bfb4faf885d33cf2d":{"cyrillic":false,"latin":true,"category":"sans"},"72d675879213cdba62da3e29157d5bb1aaf04201":{"cyrillic":false,"latin":true,"category":"sans"},"263b482ec8f22a316b2002438a2f3ab89aedde26":{"cyrillic":false,"latin":true,"category":"sans"},"c77b693bd5e175b5dcfc8a6a721b77fa3375f1fb":{"cyrillic":false,"latin":true,"category":"sans"},"af8d71e4e577b53e264a25427822853ddf2fd888":{"cyrillic":false,"latin":true,"category":"sans"},"ec2ded29c1cf0709adf6ce69123d922f74f449a4":{"cyrillic":false,"latin":true,"category":"sans"},"f48e33ee25823170faf78140f229bd6abf54c549":{"cyrillic":false,"latin":true,"category":"sans"},"19a01727a9a8dd9650589a0adb20adb1fb835c87":{"cyrillic":false,"latin":true,"category":"sans"},"75a007e61dbd18de8967ac62271b0a3ede389951":{"cyrillic":false,"latin":true,"category":"sans"},"5dd58c452b11c10ca6410db8263579999d8e0324":{"cyrillic":false,"latin":true,"category":"unknown"},"b3bff581d5a39606f9392699a0cc1dc91b1f875e":{"cyrillic":false,"latin":true,"category":"sans"},"3775db741efeb1a03eb441824da35de7b7328f3e":{"cyrillic":false,"latin":true,"category":"unknown"},"67c1c109da7fb23929394b238dbb7a991cd4ae5f":{"cyrillic":false,"latin":true,"category":"unknown"},"04d8c9c6258bdce7c3b9ebe4d944e8c1f77254ee":{"cyrillic":true,"latin":true,"category":"unknown"},"d9c2f9f908c5130ff822cba2c004517bebee9b62":{"cyrillic":false,"latin":true,"category":"unknown"},"97e8425d63aa1f55c5c4fa4bbb37a84f3d62a2a8":{"cyrillic":false,"latin":true,"category":"unknown"},"4f4e1316226f37833da54cf6424ce7cddda784bd":{"cyrillic":true,"latin":true,"category":"sans"},"33d7147939110ce5f212b83d051b02ae6620e58e":{"cyrillic":false,"latin":true,"category":"decorative"},"21dc4512b72ea4f6caf6471dc0397e7a11199659":{"cyrillic":false,"latin":true,"category":"unknown"},"61b3d0d4624b0c11c0c631f2be1e724c7eaea0c9":{"cyrillic":false,"latin":true,"category":"unknown"},"e2bf1d4d0a504552f904cb9e234588d4a7f03ba2":{"cyrillic":false,"latin":true,"category":"serif"},"9902b7b3ff265b56bbd711fbc710f9540bc653b2":{"cyrillic":true,"latin":true,"category":"sans"},"980c4645ae92004dba670d4e8f3454f77b19f853":{"cyrillic":false,"latin":true,"category":"unknown"},"803176ca624c65c6ddff4bd0ff4d7feaa908bb90":{"cyrillic":true,"latin":true,"category":"unknown"},"f5ddc5199343b0acc0acab06b36b28dfaf2a191a":{"cyrillic":true,"latin":true,"category":"unknown"},"a98ca638aa0085153ff75c3523d861587a1cb4da":{"cyrillic":true,"latin":true,"category":"unknown"},"86c23930f1f3380ec8a4bc4a923309ce6280131a":{"cyrillic":true,"latin":true,"category":"unknown"},"93fec685df972773e4dc800efec3c3b4ea4c599e":{"cyrillic":false,"latin":true,"category":"unknown"},"4b44596bcbae1c759289d647cd0937c9ef4b387f":{"cyrillic":true,"latin":true,"category":"decorative"},"b7360e488a1ccbe431182c5919a864635334742e":{"cyrillic":true,"latin":true,"category":"unknown"},"ef5c9b7b43a52a44751fd6e21470835afc38f4f4":{"cyrillic":false,"latin":true,"category":"unknown"},"a2a3d6c7591c84914818cf990f66f5d7c7c55a74":{"cyrillic":true,"latin":true,"category":"unknown"},"8886201b7f6b4059b1d4a7d39faa4a0720147215":{"cyrillic":true,"latin":true,"category":"unknown"},"82be7a7e168ea8f15aadef219b2399ae211426ad":{"cyrillic":true,"latin":true,"category":"sans"},"1db5001604d0879d5821812d072029e499f67be1":{"cyrillic":false,"latin":true,"category":"serif"},"65081abfa4b2ca6ceabc442d1b9dd7bb42363f3b":{"cyrillic":true,"latin":true,"category":"serif"},"f294e6777e7b0c32675c5895eeae320ff0473aed":{"cyrillic":true,"latin":true,"category":"serif"},"b652bf7d4219ac706d8af9ae0310b9784e7f36d8":{"cyrillic":false,"latin":true,"category":"serif"},"4900d4bfcb7223b571e1c90b31d19764f1279f99":{"cyrillic":false,"latin":true,"category":"serif"},"ccd9ae255993a3569ac8b4e15b8853c16d070a9a":{"cyrillic":false,"latin":true,"category":"serif"},"724f92201c51c9f6371e2232e37fc7016f40e41d":{"cyrillic":true,"latin":true,"category":"serif"},"90fdbaba805868b21aea0fce0cb7e7d1e90fc48a":{"cyrillic":true,"latin":true,"category":"monospace"},"cd6f913e42f3ba4e6f15384159206e0e52952a09":{"cyrillic":true,"latin":true,"category":"serif"},"665da5901faa0242369118a680a9ea40d55b31cc":{"cyrillic":false,"latin":true,"category":"unknown"},"dc3a8f06843a918b0965b22042e74840d31d9cb6":{"cyrillic":false,"latin":true,"category":"unknown"},"f03dd3121df27658731ef4eaae40edbc7a0aa9ec":{"cyrillic":false,"latin":true,"category":"unknown"},"71eb6fa7e4210ba00e52dcafe7f9978c16b6fc54":{"cyrillic":false,"latin":true,"category":"unknown"},"13c44e524e598a39ef20c1f5540d381dacc54821":{"cyrillic":false,"latin":true,"category":"unknown"},"465e9d0ecd33a816530a1599e80fd4fa3667cc75":{"cyrillic":false,"latin":false,"category":"decorative"},"6048312bd5cefe768ac9cc951e38d459050d1670":{"cyrillic":true,"latin":true,"category":"decorative"},"da7f028521cfb06acb9796c7b03d9ec0692b33c4":{"cyrillic":false,"latin":true,"category":"decorative"},"ceab2d858748e7374003cb162c82445f3525f393":{"cyrillic":true,"latin":true,"category":"unknown"},"e2d92f0a502576f899233e75cd504f2f12b3b513":{"cyrillic":true,"latin":true,"category":"unknown"},"afda73b58f81fd1ebef01ff4389d9368aed22342":{"cyrillic":true,"latin":true,"category":"unknown"},"ee88a74520bab19ef8ddf50500f2108f5bbf9f26":{"cyrillic":false,"latin":true,"category":"unknown"},"6f019056327e4cc0589fd2e622a44a2a769109d8":{"cyrillic":true,"latin":true,"category":"unknown"},"d746ac011fa814d734041a782c50b1c8d5462fcf":{"cyrillic":false,"latin":false,"category":"decorative"},"38f1e1f3399bb33001372ead8b59ae2cef367242":{"cyrillic":false,"latin":true,"category":"unknown"},"3299794f1851246ee0e9c2a540da917725427e39":{"cyrillic":false,"latin":true,"category":"unknown"},"21cc4e24480c51b212ad07348d2513a94ea4e078":{"cyrillic":false,"latin":true,"category":"unknown"},"1fea03dd575c18385bc93b8f94c767536804235c":{"cyrillic":true,"latin":true,"category":"sans"},"f0dbdb6be2580999cdb9279512a2cb9767d8ccb4":{"cyrillic":true,"latin":true,"category":"sans"},"30587c0961cf59d5c3c76a3ad5b199bd1d756eb6":{"cyrillic":true,"latin":true,"category":"unknown"},"6abe8fa0ccc0b1c1431d691a90f6d71a5956a557":{"cyrillic":true,"latin":true,"category":"unknown"},"abd6e72ff3e20f35e3162bc5fcee32112d61b639":{"cyrillic":true,"latin":true,"category":"unknown"},"3dde0214542ca773709747e15ea924d050240e78":{"cyrillic":true,"latin":true,"category":"unknown"},"6ecd5f3bd5eff09dd4eaf6a2fd8840f43c8fef7b":{"cyrillic":false,"latin":true,"category":"unknown"},"0f1115f0ebb6f6fc8095aef3d717dea54a8d7067":{"cyrillic":true,"latin":true,"category":"unknown"},"13f2cc495ed248ddef1f035ea79c6fdcc0653110":{"cyrillic":false,"latin":true,"category":"serif"},"a50dc8959035c9a424bd7f939bdf80758fc73115":{"cyrillic":true,"latin":true,"category":"unknown"},"b09c80d3e8d5f2484a42affb00a94d3e9e9d1009":{"cyrillic":false,"latin":true,"category":"unknown"},"b916323039e905ab1c2ceba4c37859608ec609ba":{"cyrillic":false,"latin":true,"category":"serif"},"c891757fb11b6de34fc12321c8c23e54df3b2717":{"cyrillic":false,"latin":true,"category":"serif"},"e6c58a50569b801db4269ad0ce3bac41153b2650":{"cyrillic":true,"latin":true,"category":"handwriting"},"9ce511a820b4e637544f94e3e76d7bc5ff442199":{"cyrillic":true,"latin":true,"category":"unknown"},"5e905903012c8c0d2a310df20de8d4fcf5524d75":{"cyrillic":true,"latin":true,"category":"unknown"},"0b6a8b3507b1bda66512016f6144c1d57d719fa0":{"cyrillic":true,"latin":true,"category":"unknown"},"3201d5997ec93e9bdcc3dee9fa3ea463975c5018":{"cyrillic":true,"latin":true,"category":"unknown"},"5458e87c22e4ec0ab9dce7bd837c285212015e0b":{"cyrillic":true,"latin":true,"category":"unknown"},"3ae04db4dbed91c2370bfaaa1880b5f5413710e2":{"cyrillic":true,"latin":true,"category":"unknown"},"8f6945f528bfadf5652780a1cc6fae0e97a5e75e":{"cyrillic":true,"latin":true,"category":"unknown"},"98f6e3f756404979497c9b57f7a51fc7ca61a5c7":{"cyrillic":true,"latin":true,"category":"unknown"},"659dc5cf79d3dbdb47347cc69007ba4f6a9fbde2":{"cyrillic":false,"latin":true,"category":"sans"},"1d5b0d68f02ab26a5c89ce0332a354d3ef25b179":{"cyrillic":false,"latin":true,"category":"unknown"},"8ae1d57e4488b29a18b328f265549c858d1c42e5":{"cyrillic":true,"latin":true,"category":"unknown"},"343e501b8f91c4a312699c185a630050c6330918":{"cyrillic":true,"latin":true,"category":"unknown"},"05fe63c24362f23e1229b870926c28a6387d8a72":{"cyrillic":true,"latin":true,"category":"unknown"},"d1180e52fe16e81cfb6eaf053a497dce231d0b74":{"cyrillic":true,"latin":true,"category":"unknown"},"7838ab09600e36fe8af31e94b79817c37b7b1834":{"cyrillic":true,"latin":true,"category":"unknown"},"74b676b1b280b9f950c6f339e583e150f8cf6dd6":{"cyrillic":true,"latin":true,"category":"unknown"},"8f00641ff657e85de89f451a4a50f59214486c10":{"cyrillic":false,"latin":true,"category":"serif"},"c72c822553c63828652c374f499fcc7a6f68b260":{"cyrillic":true,"latin":true,"category":"unknown"},"f7feeaf47970d5e06f4462e51b04104422bfe1da":{"cyrillic":false,"latin":false,"category":"decorative"},"191921077adc51e97b2a3acfa946be44426cd70f":{"cyrillic":false,"latin":true,"category":"unknown"},"8b7041ab99c744ab2cc307815ce62d449449db93":{"cyrillic":false,"latin":true,"category":"unknown"},"c770d5f0df0f05713ec6eeb0cb81c8bc22c1f9b8":{"cyrillic":true,"latin":true,"category":"handwriting"},"3978aa442dd17ceda988cf213a647b1cb3ac3da3":{"cyrillic":false,"latin":true,"category":"handwriting"},"fc292abda2b1da06db598fcdc267e9b147d61827":{"cyrillic":true,"latin":true,"category":"handwriting"},"0293a7c3ca02b93773fd3cfef92a46123e33cde2":{"cyrillic":true,"latin":true,"category":"sans"},"bcecd2fdc59f6b1eab7524fd1524c1f29aec50a3":{"cyrillic":false,"latin":true,"category":"sans"},"93f57f79dfed4ae5a1cbc26d97219f304c646e42":{"cyrillic":false,"latin":true,"category":"sans"},"0ffacfd21cb2e71285597642ac5755cf61d867d2":{"cyrillic":true,"latin":true,"category":"sans"},"bef3513c170f6bcd8f8fe3363c033cc10548e91f":{"cyrillic":true,"latin":true,"category":"unknown"},"ca680c49bc3edce803626eb9cbbb5a58941318bc":{"cyrillic":true,"latin":true,"category":"unknown"},"e5c2114e6fb430405447819cea7261d45cc01c84":{"cyrillic":true,"latin":true,"category":"unknown"},"2e6336689d905f0efadec4c86841fb66a19a5c32":{"cyrillic":true,"latin":true,"category":"unknown"},"166093809bed409441cc4fbcc0b6e55f6ff539f7":{"cyrillic":true,"latin":true,"category":"unknown"},"0b82fceb9f3d8cf08dc96f56109fad09ae4a0919":{"cyrillic":true,"latin":true,"category":"unknown"},"c02617ae5c8e49813a3bd97053c046bbf86a81c0":{"cyrillic":true,"latin":true,"category":"unknown"},"2753d7c9e6731ada8ac7f16720e22e7b46ebea19":{"cyrillic":true,"latin":true,"category":"unknown"},"40f6cf177883cda12895113c33ac45f1bc63c7d5":{"cyrillic":true,"latin":true,"category":"unknown"},"870ff68b12a3bb21606cfe3fd8abf3c64975844a":{"cyrillic":true,"latin":true,"category":"handwriting"},"8ecb0ea9b0ec4e3e580eb90417ca764aab7d67cc":{"cyrillic":false,"latin":true,"category":"handwriting"},"9ece8eb400d9b2ddae09b26ec7f1de257c9d53d2":{"cyrillic":false,"latin":true,"category":"unknown"},"72d6d6d0d73f5e7cef0b7bd92164562fc1f162ba":{"cyrillic":false,"latin":false,"category":"unknown"},"8fea8ae21013649c7bf27809ab805ad53262a4eb":{"cyrillic":false,"latin":true,"category":"unknown"},"165570d28686cbcf240b2e48b8fdefd81fc2e0f4":{"cyrillic":true,"latin":true,"category":"serif"},"0d8dc5ee4b1f67d20860dba0f1e79e19ea564cae":{"cyrillic":true,"latin":true,"category":"unknown"},"5b1aed30c84521df3e12881272dd32e3289bd6f4":{"cyrillic":false,"latin":true,"category":"unknown"},"0e848a99f126ed8b5d88c6b5cff92b6328be57a4":{"cyrillic":false,"latin":true,"category":"decorative"},"d69789ddb15a72b028090278e0ee2d05fe5c525f":{"cyrillic":false,"latin":true,"category":"unknown"},"e4715ab979c20176d1bac14368d730412e0dab2f":{"cyrillic":false,"latin":true,"category":"handwriting"},"f509f504f3d74fd8b9c3369e13ea8401a342beaa":{"cyrillic":false,"latin":true,"category":"unknown"},"8a0e24a901e29872546020ab0575e88502de265c":{"cyrillic":false,"latin":true,"category":"sans"},"12043f2d74545980ba2bb89d300a9693e8b9c139":{"cyrillic":true,"latin":true,"category":"sans"},"cfbbca6b8bacce54daeb49d85126e787e9d88dfb":{"cyrillic":false,"latin":true,"category":"unknown"},"3fcf1d93e8179982e59ff22872cf9015b80efdbc":{"cyrillic":false,"latin":true,"category":"unknown"},"d022218714679fbd0d302bf4111386b60a397daf":{"cyrillic":true,"latin":true,"category":"sans"},"7d8ebda9ef08eb4b7b96a1ed00359a3a178da44c":{"cyrillic":true,"latin":true,"category":"sans"},"b1a18811de161688b7dc78c92f1ddeb69c36e6b7":{"cyrillic":true,"latin":true,"category":"sans"},"da5932d76813d9883bc903e1f7a5564d99373f1b":{"cyrillic":true,"latin":true,"category":"sans"},"c70c45f365f8c41c3a0ea0ac3ffb90158fe5238a":{"cyrillic":true,"latin":true,"category":"sans"},"d10caf977084c14d4914581b7cf012afa375cb56":{"cyrillic":true,"latin":true,"category":"sans"},"fdaba463212955f3ff6f1658e57067097d63a5a8":{"cyrillic":true,"latin":true,"category":"sans"},"c93552770f5f64e87a53d7fa7a14f6d24feacaad":{"cyrillic":true,"latin":true,"category":"sans"},"bb6dabe06cfa224d9805c372879179bb77306bd4":{"cyrillic":true,"latin":true,"category":"unknown"},"a524c7cf1a532a38657ae14fcea818bb4d970d83":{"cyrillic":true,"latin":true,"category":"unknown"},"97d39c4e9c8faaafa80e6ea59595b3cafa66bb3f":{"cyrillic":true,"latin":true,"category":"unknown"},"0e1a68ccfdb4fc79a13abf2456910bd8030ff8a1":{"cyrillic":true,"latin":true,"category":"unknown"},"f5d7ade8c5e6a94fbdfd35cd0c731dd63bddf90e":{"cyrillic":true,"latin":true,"category":"unknown"},"d55a7fd3719149d9e267a20a033b23716f5f7533":{"cyrillic":true,"latin":true,"category":"unknown"},"0d475539a1fb1bff0a620a1b28822881fef69507":{"cyrillic":true,"latin":true,"category":"unknown"},"e2352e1524411144918ec34bffb1e2d0f71df8a8":{"cyrillic":true,"latin":true,"category":"unknown"},"1ac68d1067f7ccc18f3729135cdc396ac22d323e":{"cyrillic":true,"latin":true,"category":"unknown"},"074f0cc867e59435a227c21a29342ca69e886942":{"cyrillic":true,"latin":true,"category":"unknown"},"05e25d2d5a4196dacedb92073be6c91673d11393":{"cyrillic":true,"latin":true,"category":"unknown"},"a1e15a4002962878d19a89a2635de1bae4b0b43e":{"cyrillic":true,"latin":true,"category":"unknown"},"e0b8965229d0a0408cb585492a5f725e2a1d1efe":{"cyrillic":true,"latin":true,"category":"unknown"},"0217c8b15c8cdf5f9de291cf3563d22a13c405da":{"cyrillic":true,"latin":true,"category":"unknown"},"3a17df99ade872d124a6997f3221ed351b1021ff":{"cyrillic":true,"latin":true,"category":"unknown"},"4a84ce1ad2b65772f1bdbaed16a7840a471e4a8a":{"cyrillic":true,"latin":true,"category":"unknown"},"60ee7d696bbd15bd827519c7d3b2b8a468cb4811":{"cyrillic":true,"latin":true,"category":"unknown"},"b30a2c0436e90d664ddbc2ec539381bbb9f2e064":{"cyrillic":true,"latin":true,"category":"unknown"},"b7fada54371dc606bd0d2e023c89e18a65d1fa30":{"cyrillic":true,"latin":true,"category":"unknown"},"a87df3abf6acf57332cb4339c590006cba4f1945":{"cyrillic":true,"latin":true,"category":"unknown"},"651cdcb6409b0d0f6766fa61ce13c09a5918b7e9":{"cyrillic":true,"latin":true,"category":"unknown"},"c53343d0bfc85a3d1adce640b3f4e8d8d56da750":{"cyrillic":true,"latin":true,"category":"unknown"},"beee21a0e0c05c68d626799fa1918b0e875cbf50":{"cyrillic":false,"latin":true,"category":"unknown"},"62f0b59a63408a5eb4b05bdf0da06aa2560e10fc":{"cyrillic":false,"latin":true,"category":"unknown"},"33b04e76b717520d0e669919690d3b0001fcf2e4":{"cyrillic":false,"latin":false,"category":"symbol"},"2eb3931a214a0cc0a6a14892a6a2c7fd8756e370":{"cyrillic":true,"latin":true,"category":"unknown"},"ecfe4a514887f08d88af750576b08e1343617aab":{"cyrillic":false,"latin":true,"category":"serif"},"ad75b46c2b22d61cd7ad834373b74b8576f53b7c":{"cyrillic":false,"latin":true,"category":"serif"},"44f05465ad7f6f8daec96f6b829359dd41f22acf":{"cyrillic":false,"latin":true,"category":"serif"},"0bd9acc5b373092c10754824183dc9e260e8cf5b":{"cyrillic":false,"latin":true,"category":"serif"},"41135b1237605d2b54ebcee3c0a1db8a02d09c95":{"cyrillic":false,"latin":true,"category":"serif"},"0e7407bb745b5162e15bef7ae0c0d7e494c8e0ed":{"cyrillic":false,"latin":true,"category":"serif"},"68144c9ee6026c0fc0a53c7d969a03468bf04542":{"cyrillic":false,"latin":true,"category":"serif"},"0a98bdfd4fba9e7f990c4c67ac8734563d4d7d4f":{"cyrillic":false,"latin":true,"category":"serif"},"4b589b5704cb6db3cecd86767a588596347608b2":{"cyrillic":false,"latin":true,"category":"serif"},"f4d5c51e87e6ab618e1da37e7670295b9a84db79":{"cyrillic":true,"latin":true,"category":"decorative"},"36b672b9ccd4fa11948d0a29d21542ce535e05cc":{"cyrillic":false,"latin":true,"category":"serif"},"1fb30e5429e2dc3f0432f4bb1b366bfe780c0390":{"cyrillic":false,"latin":true,"category":"serif"},"1d844c5ae45b80a0c3983b741cc22bdc72b1fecf":{"cyrillic":true,"latin":true,"category":"handwriting"},"94b168b61e3ce86f837848523b78786d5cbc3031":{"cyrillic":true,"latin":true,"category":"serif"},"4afc0c713269ad1f3cfe1f29431669428eb54bb1":{"cyrillic":false,"latin":true,"category":"unknown"},"9024f676a7c1dd8bf9d18994213e447e4f1036bf":{"cyrillic":false,"latin":true,"category":"serif"},"fa6c21409f0060858bba5165e70b8f47d99c94f2":{"cyrillic":false,"latin":true,"category":"serif"},"f216a4984d0953afbda38ebb9fe6b42d3a8cb1f4":{"cyrillic":false,"latin":true,"category":"serif"},"7d8881613e35aad471927f67b1bd51b5c0fc0c81":{"cyrillic":false,"latin":true,"category":"serif"},"cec4f3646e4cab0aa725f6fc0a3032eea4365400":{"cyrillic":true,"latin":true,"category":"unknown"},"b7ff5b5a8bef20581492738ab15063dd05a39b7e":{"cyrillic":true,"latin":true,"category":"decorative"},"8ef91a22f393aa49a6eea79e15972c1513d763a0":{"cyrillic":true,"latin":true,"category":"serif"},"57570037fe254bab22c055ea93926960e69c6420":{"cyrillic":true,"latin":true,"category":"handwriting"},"1b42da8a40a4f9aaef73740dcf1bf665d8f12c5c":{"cyrillic":false,"latin":true,"category":"unknown"},"d382fb8ffb25175418936828ab2b5e7fd5768700":{"cyrillic":true,"latin":true,"category":"unknown"},"7242038a66b28dae80ad768638797f4c1c184cc3":{"cyrillic":false,"latin":true,"category":"unknown"},"98408189c37a0dd59bc84700d63361a748cef80d":{"cyrillic":true,"latin":true,"category":"unknown"},"fbc26c6a9f8ecbb395ed6e8992c8ee92f21aa479":{"cyrillic":false,"latin":true,"category":"unknown"},"c5d2f3ecba7acc659cba0720e3d1e2de6337f0fa":{"cyrillic":true,"latin":true,"category":"serif"},"03a8474881d64a1389d919aca43c546a34d64a2f":{"cyrillic":true,"latin":true,"category":"serif"},"418431c71fb5ebc06c0f9a14d5c104563ceb6973":{"cyrillic":true,"latin":true,"category":"serif"},"d4cf34bf66e41537579cf326b4253fc44455a119":{"cyrillic":true,"latin":true,"category":"serif"},"a6a24ba7155a835e87106e0516ed08349052093e":{"cyrillic":false,"latin":true,"category":"unknown"},"49f84279114b33a07f3449886709b478abf12818":{"cyrillic":true,"latin":true,"category":"unknown"},"5af29a46ca0f6b519a6f036003d461666a63c6d9":{"cyrillic":false,"latin":true,"category":"monospace"},"7b35f2f494bb3fe4f7ef86cd53d69ba31ec10e02":{"cyrillic":false,"latin":true,"category":"handwriting"},"3c766c3959fe14f75f8a465dcb68b7ed970ecf14":{"cyrillic":false,"latin":true,"category":"sans"},"45c69f4b5f70ebd75cbb4015478817cf2a54469c":{"cyrillic":false,"latin":true,"category":"unknown"},"4a1b6dcb021cf8d9ff51e8af7de81951b6751870":{"cyrillic":true,"latin":true,"category":"unknown"},"943677763fcacdc8b7367778d88ea70b45ba3de2":{"cyrillic":true,"latin":true,"category":"unknown"},"5818059261ea77ee0e40fe9141e6306ec83bddd8":{"cyrillic":true,"latin":true,"category":"unknown"},"85c2f588e1cb0133b4a2b06c6e318eb5e59e7bcc":{"cyrillic":true,"latin":true,"category":"unknown"},"0b32f61e7b25f71445cad83e75872afcfc102de8":{"cyrillic":true,"latin":true,"category":"unknown"},"352b6e4b89ac8ea8e4a9ae7ad2ef1128f54dd887":{"cyrillic":false,"latin":true,"category":"unknown"},"2756d9d70487520ae66255991075fec5032ca374":{"cyrillic":false,"latin":true,"category":"unknown"},"1c42c03bf00c24c7fc0d7a271ab582a7cbbf0d81":{"cyrillic":true,"latin":true,"category":"unknown"},"5bdc275552ad411e138e15166d53e40e43b4f0c4":{"cyrillic":false,"latin":true,"category":"sans"},"ea80dfb48c8d4839593b9b91b04f5f7ea17496fc":{"cyrillic":false,"latin":true,"category":"sans"},"c2ab1d4ce09b854cf73c38987237532591aed850":{"cyrillic":false,"latin":true,"category":"sans"},"861f7a23e7ed0109c42bc65ab0dbdd5484ca6f4a":{"cyrillic":false,"latin":true,"category":"sans"},"bb0f568e3dd01893d4b099afb419c8988ad1917c":{"cyrillic":false,"latin":true,"category":"unknown"},"8e86a75dafb6b3b27ad4e705fb14045dcf35284a":{"cyrillic":false,"latin":true,"category":"decorative"},"94a164cc820ad566e768ac95df069980ec498662":{"cyrillic":false,"latin":true,"category":"unknown"},"9871cc8e2c82cdebc48900e975180ff623182cd2":{"cyrillic":false,"latin":true,"category":"unknown"},"a950cdf4b739717d14cf0b31e211170b720f64cc":{"cyrillic":false,"latin":true,"category":"unknown"},"938210ec1179fae2baf27e8c70673387724d8898":{"cyrillic":true,"latin":true,"category":"unknown"},"cb4d5020d9ff766848dd03c5cc99833b3fe6abc1":{"cyrillic":false,"latin":true,"category":"sans"},"fc9d11aa5dab99cff484394afd967bf95c340065":{"cyrillic":false,"latin":true,"category":"sans"},"fd479f5ef2542c3dfa6302f72d0afad763719284":{"cyrillic":false,"latin":true,"category":"sans"},"7d0fd035bb5bd30d8fbd891d709511aea83e4762":{"cyrillic":false,"latin":true,"category":"sans"},"5a5f3febf5e43abffdcacb38567a1b0104d2e422":{"cyrillic":false,"latin":true,"category":"sans"},"50df01de34b2d0447421dbac9e08f561eee5abc7":{"cyrillic":false,"latin":true,"category":"sans"},"07c93b5a05cf681df110f10a028cb78891ad15fe":{"cyrillic":false,"latin":true,"category":"sans"},"19131c81f413fa60843c37280cfbab7f937a29c1":{"cyrillic":false,"latin":true,"category":"sans"},"34342c77f4f576d7013ea4e8ed5770f31afd2ba1":{"cyrillic":false,"latin":true,"category":"unknown"},"75a7adccb28a4981d8c5ec02270c37cb5acbe3d0":{"cyrillic":false,"latin":true,"category":"unknown"},"76f4ddb219cb97d2880423ccd5674a8a7f45f0bb":{"cyrillic":false,"latin":true,"category":"handwriting"},"dc67ed6a00c3f9be7ce1059bf08aa41254c263b9":{"cyrillic":false,"latin":true,"category":"handwriting"},"4662822de1c3523391dabf7753cdb22ead3e5649":{"cyrillic":true,"latin":true,"category":"unknown"},"7225a4e8b61e543f03ea6c9399b098f9b589bc5e":{"cyrillic":true,"latin":true,"category":"unknown"},"6417f2a55450a4770c2fca060611b90dff2cd0d0":{"cyrillic":false,"latin":false,"category":"symbol"},"480384bbf3da549e46b0f7ba6e415142e8d849c2":{"cyrillic":true,"latin":true,"category":"symbol"},"90ada36bec32cb36ab83d1db9354fe224a923d8a":{"cyrillic":true,"latin":true,"category":"symbol"},"e42623db7ae1943ef276ad786d350c26f2745fd2":{"cyrillic":true,"latin":true,"category":"symbol"},"d233a6c7ac08be0aa915e0dea690e793692839e0":{"cyrillic":false,"latin":true,"category":"sans"},"836629bbaadaef366486208f295d5cc2627f1383":{"cyrillic":false,"latin":true,"category":"unknown"},"ca41998d56c2fe76e38517026a8f49146b8ef3c3":{"cyrillic":false,"latin":true,"category":"unknown"},"ae80f6b7463a523404effd6bc00bc4e06b45ad60":{"cyrillic":true,"latin":true,"category":"unknown"},"c3a96c8e4b743317cc3adeaceb9aa6d09b848625":{"cyrillic":true,"latin":false,"category":"handwriting"},"dce604b50a1fa611f7286376a7291554f6291c09":{"cyrillic":true,"latin":true,"category":"sans"},"8a5e41a948e4e7b19e45960657c112341e05c316":{"cyrillic":true,"latin":true,"category":"sans"},"78fcdbc8d7a4800fe166ed007e68a4b774139975":{"cyrillic":true,"latin":true,"category":"sans"},"4d115c7f1478340a1b88524b5d1558ce1941fe53":{"cyrillic":true,"latin":true,"category":"sans"},"ba3890b69903af718d59e3ff4d8fe9a5180ee057":{"cyrillic":true,"latin":true,"category":"sans"},"b7abd50f41752a25a123adccbcc3899fa36b5326":{"cyrillic":true,"latin":true,"category":"sans"},"a8c0bca331e59a983d786ab5a80a3147f7abb3b3":{"cyrillic":true,"latin":true,"category":"sans"},"8f787af72651a2aaf7fb0ae3ff446599edfb8103":{"cyrillic":true,"latin":true,"category":"sans"},"7a9912ead5cdc5cbaa7bfe69606254118b5c1ba0":{"cyrillic":true,"latin":true,"category":"sans"},"dd68f8d2ec7a897ebe2f427ee058a689267c3de0":{"cyrillic":true,"latin":true,"category":"sans"},"987e92d918141b066d0db608ab6fd8f253f52605":{"cyrillic":true,"latin":true,"category":"sans"},"801dc373b9d990d538768e635c6a6e06fa31db0c":{"cyrillic":true,"latin":true,"category":"sans"},"759ae31a74037751d54c72b461c23f6aafa4710a":{"cyrillic":true,"latin":true,"category":"sans"},"9e6e5084aad6a4eeda685ee3a5f1ea85244a5d32":{"cyrillic":false,"latin":true,"category":"serif"},"7a1830a2b0f804e46db9dd8bc3028f906f48030c":{"cyrillic":false,"latin":true,"category":"serif"},"a19ab6c60ab23164b2e842b06786a9039e9d6848":{"cyrillic":false,"latin":true,"category":"serif"},"90d204f95c82cc973045636f32c266b43a1623c7":{"cyrillic":false,"latin":true,"category":"serif"},"c954c6d4dd3f78394ba3d89c30444b669027c41e":{"cyrillic":false,"latin":true,"category":"serif"},"a62dcc076b63af9954b7fab406e92eeae1d3235a":{"cyrillic":false,"latin":true,"category":"serif"},"12383c3d43ca36616c6aade0b50cbf1ca14062cd":{"cyrillic":false,"latin":true,"category":"serif"},"539dddbd30a9de4637721c087d9caca65e75c220":{"cyrillic":false,"latin":true,"category":"unknown"},"5ca8d93fddd843210a74ca5b950e33ae8ca3d76a":{"cyrillic":false,"latin":false,"category":"unknown"},"4bc527dfdbd91e2e60c3b3d8dee1861d35cd5ce0":{"cyrillic":true,"latin":true,"category":"unknown"},"15368046adc223c9781befc7a7d3afb68faf0f9b":{"cyrillic":true,"latin":true,"category":"unknown"},"c8af7f89f1df396da650b9980eaeee97f3d8c0ad":{"cyrillic":false,"latin":true,"category":"handwriting"},"838d0101f9cde294102c6cb144a45ffd7e303b6a":{"cyrillic":true,"latin":true,"category":"unknown"},"6ea708e5fe6c889edf30ff3dd933026bc59178b6":{"cyrillic":true,"latin":true,"category":"unknown"},"004310163206cdf369ee62f7ac430ae7a2248a29":{"cyrillic":true,"latin":true,"category":"serif"},"a7c8a741b98a2009343d2ed0d5f654fbf7c8586f":{"cyrillic":true,"latin":true,"category":"serif"},"c64f1716bdbf261770806b5420b5b66941ee80df":{"cyrillic":true,"latin":true,"category":"serif"},"ab34c06e9104a7750b3ae5ffb0d907dfb04e030e":{"cyrillic":true,"latin":true,"category":"serif"},"d602f6425c278c3cd36d2b2ca29ff4f974b803c7":{"cyrillic":true,"latin":true,"category":"serif"},"b7aab8320f4eff94fb3df7cd959b2b3b8d448472":{"cyrillic":true,"latin":true,"category":"serif"},"07cf4f11f25e4d006ad7267256257264f62aae41":{"cyrillic":true,"latin":true,"category":"serif"},"c00a1d5c20512294e04f700db21bf67158187549":{"cyrillic":true,"latin":true,"category":"unknown"},"f6b305dfa36a37610cfb09b3b90ea8553abd5d7e":{"cyrillic":true,"latin":true,"category":"decorative"},"22ebf0859c576d8ab5f828f43b6c8e9df4864d36":{"cyrillic":true,"latin":true,"category":"decorative"},"6f958e54b4e25a7f2e7349839629f8aedd1f865e":{"cyrillic":true,"latin":true,"category":"decorative"},"bb0b10900c112f5a48071a604fb6f953fe25fdbb":{"cyrillic":true,"latin":true,"category":"decorative"},"e38f469c4fa921537a8632a03f3ef546e45ec888":{"cyrillic":true,"latin":true,"category":"sans"},"119aa76cd5a866c1070028e54e15f8a6323d2faf":{"cyrillic":true,"latin":true,"category":"sans"},"7e48e77cd7b4ab01566ea647e9bad15c18ab4258":{"cyrillic":true,"latin":true,"category":"sans"},"8c14e814b92016c61db2181564afc8dcebe15dad":{"cyrillic":true,"latin":true,"category":"sans"},"ff626914db2e341e28037b87beb311f339327d02":{"cyrillic":true,"latin":true,"category":"sans"},"e106f3d2730b698a75e1154ca45f221f3facc859":{"cyrillic":true,"latin":true,"category":"sans"},"725e8fbd29e2ca02cfa3dce671a8fc3e5ae3fa47":{"cyrillic":true,"latin":true,"category":"sans"},"ebd1d6f18498ce5638b25da0adab7cd90907dadd":{"cyrillic":true,"latin":true,"category":"sans"},"06528602a488c9bf2e5ce83e3592f366ae802e79":{"cyrillic":true,"latin":true,"category":"sans"},"a24313c8253663ca5325da851c008f5a06743518":{"cyrillic":true,"latin":true,"category":"sans"},"0c233e79fc3d8659342e60f9c2705ff626742349":{"cyrillic":true,"latin":true,"category":"unknown"},"6237a8af3f42b921aec8a1e3970e6e1ebe89fb2b":{"cyrillic":true,"latin":true,"category":"unknown"},"29284fb0a67db9077b3594579488c53fc01dde20":{"cyrillic":true,"latin":true,"category":"unknown"},"8d2bb3665a4c3d307fc054c804e52f619d0f1a11":{"cyrillic":false,"latin":true,"category":"unknown"},"6422597cca2b6c11c4c06f9f166917e31c630e99":{"cyrillic":true,"latin":true,"category":"unknown"},"01401714b2ec6dc1dd900fac0d0b8bd8a716c68e":{"cyrillic":true,"latin":true,"category":"unknown"},"f8deaa6a7d0c009f1819d1ff35bf0fde65ba37e1":{"cyrillic":true,"latin":true,"category":"unknown"},"7e1840043db5b7e53da64ff2c804fdf6103c5f26":{"cyrillic":true,"latin":true,"category":"unknown"},"eb40bca5c1ba9361d83deaf90ac9decff11ce8c7":{"cyrillic":false,"latin":true,"category":"handwriting"},"7dc0812491765094ea425c24dae955b9c362bdcd":{"cyrillic":false,"latin":true,"category":"unknown"},"ad7088a49c98a362c6886ec0d8fccce0052b0d6f":{"cyrillic":false,"latin":true,"category":"decorative"},"ee43a4ed48b186de824faba265d5123126243954":{"cyrillic":true,"latin":true,"category":"unknown"},"1f68915ea3a638a00b60c0c82b83ca958617e49f":{"cyrillic":true,"latin":true,"category":"unknown"},"87ac189aedcac8a39ae5c01fe9ace3e74eda453b":{"cyrillic":true,"latin":true,"category":"unknown"},"2dba39b73c8e6e987843b6551da23190626d1706":{"cyrillic":false,"latin":true,"category":"unknown"},"f46b20ca8d956e22ccb18314a03ec5b083e48551":{"cyrillic":false,"latin":true,"category":"unknown"},"27e3a13dc1238777e158e9988fce9c823d25ff68":{"cyrillic":true,"latin":true,"category":"serif"},"eaf01ea780a0c0c4c51e116969daff4a8addf880":{"cyrillic":false,"latin":true,"category":"serif"},"4899c0f2481300462c4c12b7c9e04d7de54ab6e1":{"cyrillic":true,"latin":true,"category":"serif"},"3982a478bad850f0185839dd1a739f4cea1644a9":{"cyrillic":true,"latin":true,"category":"serif"},"a4ff04dba288da2c4a4bb2c9ccc6518109c042e5":{"cyrillic":true,"latin":true,"category":"serif"},"85e0b33e956ca0e02f7740324768ccfd59679b3b":{"cyrillic":true,"latin":true,"category":"serif"},"d3eaf7b4a2664a6eb1d56458ca4f9b610b821988":{"cyrillic":true,"latin":true,"category":"serif"},"07915eb11d4fd2b58c2139530178806bb1c14026":{"cyrillic":false,"latin":true,"category":"serif"},"8402f84d9099eabeeef97dd7ea2ad862620e7dea":{"cyrillic":false,"latin":true,"category":"serif"},"41d6d120811f24a45f0616b4fb2344c3507a81fb":{"cyrillic":false,"latin":true,"category":"serif"},"6af60125d38454afc76122d6b263c08bb3c4e6b9":{"cyrillic":false,"latin":true,"category":"serif"},"b63111ee2a014133045eb8f665e30f332dc3c3fe":{"cyrillic":false,"latin":true,"category":"serif"},"dde9e631819edcabb668bdeb9b59e66725caa5ef":{"cyrillic":false,"latin":true,"category":"serif"},"4f3cb867e75809fb7605806767590a9f1536b3b8":{"cyrillic":false,"latin":true,"category":"serif"},"7b2302b787c561a6a798bd8fa6ce924822b13083":{"cyrillic":false,"latin":true,"category":"serif"},"bf8e8543ed1d7fddf30824b79559b921d01a8c37":{"cyrillic":false,"latin":true,"category":"serif"},"9762c5f9f2c38d9893f886680c288b7b9b6166b3":{"cyrillic":true,"latin":true,"category":"sans"},"46f8e8b261c888aaf551e1255da0cbca832b0ddf":{"cyrillic":true,"latin":true,"category":"unknown"},"758bda4041b19da5fea266e850d564ba65f4bcc9":{"cyrillic":true,"latin":true,"category":"handwriting"},"c507445ea7cc119ca7a376901724fe58f5f82875":{"cyrillic":true,"latin":true,"category":"unknown"},"e217d383eed4c6a008369bff672eef0198ec70c0":{"cyrillic":false,"latin":true,"category":"sans"},"d03aaaa5aef728bb99c4ec7929ebb6a654a2d3be":{"cyrillic":true,"latin":true,"category":"unknown"},"7acf378520f23328c9d2c0f8d1cdffd98d895b8f":{"cyrillic":false,"latin":true,"category":"unknown"},"a5e923cfabe6ed001f1bc3458970b6dff0d01d81":{"cyrillic":false,"latin":true,"category":"unknown"},"a523a0139a1d099c6bb013a20571ed71eff7cf18":{"cyrillic":false,"latin":true,"category":"serif"},"2f80a277d9a2a64f9f08509ad29ff94b9340234b":{"cyrillic":false,"latin":true,"category":"serif"},"ffafabc50e0dbd8caf0e9de67d1c75906edf64a6":{"cyrillic":false,"latin":true,"category":"serif"},"b7bf9815e45364984282533fa291c9ecfc5c3ab2":{"cyrillic":false,"latin":true,"category":"serif"},"139ff06e00810b9211038c56c6516d01cf35bf87":{"cyrillic":false,"latin":true,"category":"serif"},"52d6d8d89ccde57ab5c22f66a54bc517ed1b69d5":{"cyrillic":false,"latin":true,"category":"unknown"},"5da15c7b6699beec274f944cdf54bb15b8ea4e1a":{"cyrillic":false,"latin":true,"category":"decorative"},"b6af3501cbef7a686f747309111643f38ef73eb1":{"cyrillic":false,"latin":true,"category":"unknown"},"c62b66c0f72935ed85c893940333ae245e225bea":{"cyrillic":false,"latin":true,"category":"sans"},"2a4810b6d8159a9c40ce76d400a236bc9ce1dcc3":{"cyrillic":true,"latin":true,"category":"unknown"},"ce24e373a463a42873d9fb61c66f17d2bb495fd7":{"cyrillic":true,"latin":true,"category":"unknown"},"eb1a18efbe3fe20c17090c3374c1132e207f2fc9":{"cyrillic":false,"latin":true,"category":"unknown"},"6f38e8df0a7b520b686db0d51b4d6dc332139b4a":{"cyrillic":false,"latin":true,"category":"unknown"},"5f4ef1fe9a4dedc3ab64a5ad8e048d5def91018d":{"cyrillic":false,"latin":true,"category":"sans"},"da54f6c11b250c6cc6aae3e6638e9a182e7e02c5":{"cyrillic":false,"latin":true,"category":"handwriting"},"5fab47a58579e47bea33754d7ebe72f7b7812abb":{"cyrillic":true,"latin":true,"category":"unknown"},"bf2799f73ed343ade5c7380b53b80c3c98b967dd":{"cyrillic":false,"latin":true,"category":"unknown"},"a3398194e794f8f2489c523569096bf4528da3d6":{"cyrillic":false,"latin":true,"category":"sans"},"4f40dfbf2657fccae27d24515af550ec01c41f93":{"cyrillic":false,"latin":true,"category":"sans"},"d1d7463809908de6749d4de4bb0be40dfe71dec6":{"cyrillic":true,"latin":true,"category":"unknown"},"951c0e23530969eb4130e91e21077320faafec9f":{"cyrillic":false,"latin":true,"category":"unknown"},"99980fd68106516c82532e8c5421002a9c647ed8":{"cyrillic":false,"latin":true,"category":"unknown"},"da0b1f15da2c64174cfc682c6bd1e0ae8ffc9133":{"cyrillic":false,"latin":true,"category":"unknown"},"ee6732212810cbd1677862e221db0ac0e94b7827":{"cyrillic":false,"latin":true,"category":"unknown"},"866914b5257899b9cc852b0d20afc51859cae878":{"cyrillic":false,"latin":true,"category":"unknown"},"c746798cf9e39e6a377274a2d95136890fed49ff":{"cyrillic":true,"latin":true,"category":"serif"},"b2971b1248f53c39e08526733433a3f42d7c6ba8":{"cyrillic":true,"latin":true,"category":"serif"},"9c36179127d1ff2601ab309b14952e6a0b01a805":{"cyrillic":false,"latin":true,"category":"serif"},"bcf268094749a3d273f20b88bfd44a122d318db8":{"cyrillic":false,"latin":true,"category":"serif"},"25ccf5715664d7f388428bfe610f08896f2fa25a":{"cyrillic":false,"latin":true,"category":"serif"},"4af5cb7852558c3c8c8fbd787b638ea226b85351":{"cyrillic":false,"latin":true,"category":"serif"},"b797bdce14db0fe6aa68d7787e6be31736d76b5a":{"cyrillic":true,"latin":true,"category":"unknown"},"98517bfcec407681c26859d5e05c68e9212e05ed":{"cyrillic":false,"latin":true,"category":"unknown"},"d462cd1008c7f8a273b645c533ecde05829db53a":{"cyrillic":false,"latin":true,"category":"unknown"},"343807f57f831cda58a2b0619545587e0df5ef99":{"cyrillic":false,"latin":true,"category":"unknown"},"d418061ab0266d32e2bc7da40a080ed86f06ce20":{"cyrillic":false,"latin":true,"category":"unknown"},"c1a85dcff60174eba443c3c30b33b2ff4603067b":{"cyrillic":true,"latin":true,"category":"unknown"},"50781b35f3a6789d7ad406fdb482c1ace9360e6f":{"cyrillic":true,"latin":true,"category":"unknown"},"7de3ba72da8cbae0917c4c0aa1998e1cd19d84b3":{"cyrillic":true,"latin":true,"category":"unknown"},"ff4fc6f8529855a0b4bb6752455a71a0b3e6a734":{"cyrillic":true,"latin":true,"category":"unknown"},"158ca2882a9eabf94b03ff9f6c735b6ec163f393":{"cyrillic":false,"latin":true,"category":"serif"},"5d017aa934bf95a7b53e9db9763cb656174b3736":{"cyrillic":false,"latin":true,"category":"serif"},"d779e40ca9957eb0ae53ba4ac8bdd7c94166ae9c":{"cyrillic":false,"latin":true,"category":"serif"},"7ff3c680316d84bc8ae046f26665331827c0e150":{"cyrillic":false,"latin":true,"category":"serif"},"4c75379df583aea5d425ee68b56ff5b805982ee3":{"cyrillic":false,"latin":true,"category":"unknown"},"1f3f5354b0b1b1a22495b4afaf251ec54cad185b":{"cyrillic":false,"latin":false,"category":"symbol"},"ab8b07d00eb76a226c1be800cd5288b5688bcde2":{"cyrillic":false,"latin":false,"category":"symbol"},"65181b0c16570e19d17b3d9831ab37b78eea292a":{"cyrillic":true,"latin":true,"category":"unknown"},"28a48024b97931e9b72d27743ebec2a7d87d4b25":{"cyrillic":true,"latin":true,"category":"unknown"},"8242ddd694374a10c94931da84505812f0cbed6c":{"cyrillic":true,"latin":true,"category":"unknown"},"7cdf1ec0be9cefde360a4a283e9921254d6f383f":{"cyrillic":true,"latin":true,"category":"unknown"},"21a564d5536d3599c3345e1080adce558a1f5a70":{"cyrillic":true,"latin":true,"category":"unknown"},"3eb8d4f0e39a9f6341f69294380860fe9072afa2":{"cyrillic":true,"latin":true,"category":"unknown"},"98d6de7dc06fa086dc96718de7655fad21d40d3d":{"cyrillic":true,"latin":true,"category":"unknown"},"c89b8d2206a745fa870962c51bbd648f73b5b978":{"cyrillic":true,"latin":true,"category":"unknown"},"16b6474ed8473b164fc17fd94b5f3ff287d35b4a":{"cyrillic":false,"latin":false,"category":"symbol"},"b10186b0e0cc78b16d2ff20033d221156b6f3ee3":{"cyrillic":false,"latin":true,"category":"decorative"},"2740216e95134b99da0fa18a45a92b681edb8d2b":{"cyrillic":false,"latin":true,"category":"decorative"},"98fa5ad43c5ff7b9c3c9f74e88c8241008dcb0ff":{"cyrillic":true,"latin":true,"category":"sans"},"a253ac60ccb61f6468befa4f7f05451f99837e8b":{"cyrillic":true,"latin":true,"category":"sans"},"c883e43d901e2de244e1a402f6828b83b6cde79c":{"cyrillic":true,"latin":true,"category":"unknown"},"ddb0d0dcd49ffea1c121bd2a41e4e534e067675f":{"cyrillic":true,"latin":true,"category":"sans"},"ee98f74a8fd8fd19c53f23439902cbf3735f00b3":{"cyrillic":true,"latin":true,"category":"unknown"},"da5c0a7a4ddd595ca54691806dc59ad58390ddf0":{"cyrillic":true,"latin":true,"category":"unknown"},"bd40fb64a11c7b1836d93c8b5a7439ed0390b578":{"cyrillic":true,"latin":true,"category":"handwriting"},"51261a5f596076b6c7d6e649353fa2c9a66b4f98":{"cyrillic":true,"latin":true,"category":"handwriting"},"7aa1b68abf0cb8427beab15da5247bba5ed5778c":{"cyrillic":true,"latin":true,"category":"unknown"},"45c30719d47ff16f2dc644b1fd68059cefd69b69":{"cyrillic":true,"latin":true,"category":"handwriting"},"9e251df419fb3eafd7e4d9a5a8c4a705eb647849":{"cyrillic":true,"latin":true,"category":"handwriting"},"bfb7ebe02c832f345b2fc46e069a23c74f0f0091":{"cyrillic":true,"latin":true,"category":"handwriting"},"b88d0a5d14eb9c69f8084538293bc0e30d18bfdc":{"cyrillic":true,"latin":true,"category":"handwriting"},"09b097e91288b1c103682529bccc2a1a529fe379":{"cyrillic":true,"latin":true,"category":"handwriting"},"5fd8b7ad73cc5ec0f3186e7ca7839fc5daa11f1c":{"cyrillic":true,"latin":true,"category":"handwriting"},"73271ca0110d8341bfcb35b6e8ff83b7a7c98fab":{"cyrillic":true,"latin":true,"category":"unknown"},"825ab1032ea67b590a60319372dc2818148014b5":{"cyrillic":false,"latin":true,"category":"handwriting"},"baf1202686f0d6123a467896c04ff254f77c57c6":{"cyrillic":false,"latin":true,"category":"unknown"},"2112f14edf9284442c0dda25894cd3db6bcbbadd":{"cyrillic":false,"latin":true,"category":"unknown"},"c2a544384948d465aecfaca6e5c31122e7373cc4":{"cyrillic":true,"latin":true,"category":"unknown"},"52a8d7318a2aac5204c66869afd57713444a909f":{"cyrillic":true,"latin":true,"category":"monospace"},"58523e90200233048078d54473069137fe336b13":{"cyrillic":true,"latin":true,"category":"monospace"},"21f8b277692d6da218de95e03c4493e55480b85f":{"cyrillic":true,"latin":true,"category":"monospace"},"a0340275f7b8849bc276d3143f31ceed37c2c164":{"cyrillic":true,"latin":true,"category":"monospace"},"2d07ecffca84ea5be9c05ede13a38b5c09502f3f":{"cyrillic":true,"latin":true,"category":"monospace"},"3df7d3aa545ef333c865e05d5457bec5c4a7d573":{"cyrillic":true,"latin":true,"category":"monospace"},"70ebcc297351f6649b73e8b5be1c82dd38be172b":{"cyrillic":true,"latin":true,"category":"monospace"},"31a2ee9040d3052fcd7cd5e8aa54926f9eb86689":{"cyrillic":true,"latin":true,"category":"monospace"},"f17fbcb7f2ea190631a9457145d68dfb8e41aad2":{"cyrillic":true,"latin":true,"category":"serif"},"6e0d10c13f827594098169c0c3fb17f98e7d25e0":{"cyrillic":true,"latin":true,"category":"serif"},"191e7783791071fb22cd765132de1265502439a1":{"cyrillic":true,"latin":true,"category":"serif"},"5eb1c381a6bfebb1177a5c6ca10e2e154215bc5a":{"cyrillic":true,"latin":true,"category":"serif"},"2dfb6cfd4f1ff0fafcfd050f5719aed44dd6ba15":{"cyrillic":true,"latin":true,"category":"serif"},"4bb435d3105035856714d320f458120df7b11fe6":{"cyrillic":true,"latin":true,"category":"serif"},"f559cfd677029df08ca6aa4b6c7398474d352672":{"cyrillic":true,"latin":true,"category":"unknown"},"006a75a90538b78f4a9aaa8659ee00a48f0850d4":{"cyrillic":true,"latin":true,"category":"serif"},"889c1d9bbd041a4a42a858fc282aac5117c69e69":{"cyrillic":true,"latin":true,"category":"serif"},"aa0188ee5d0aff44067fc066952e38c614f49c40":{"cyrillic":false,"latin":true,"category":"unknown"},"b7cea7a01bd677ca55776994ac61100d153444f0":{"cyrillic":true,"latin":true,"category":"unknown"},"10b520c7fe8a9406c64cb066d02b414795e3e5b0":{"cyrillic":true,"latin":true,"category":"unknown"},"385e0d3d2e08c8b20d3a3125c3cc6b2cae289140":{"cyrillic":true,"latin":true,"category":"unknown"},"93b4dec095d7c666c200ea726b3406f11e61bb7d":{"cyrillic":true,"latin":true,"category":"unknown"},"f92ca6c32011db8809ee380f9ea5ffe704c6feda":{"cyrillic":false,"latin":true,"category":"decorative"},"3b50eebc3ae583997d71f495033a1bfcd9058fea":{"cyrillic":false,"latin":true,"category":"sans"},"bfce3d5e2a58acd07597164fc6d91aee58f823ae":{"cyrillic":false,"latin":true,"category":"serif"},"8c1c870aede860135371b6a3eff5917a1072fd47":{"cyrillic":false,"latin":true,"category":"serif"},"f4816e5714ae4d2cbf99e9d9c0302bb21d4d5838":{"cyrillic":false,"latin":true,"category":"decorative"},"41138b8dc523518b76b676b4ade5ea0783e7f0e3":{"cyrillic":false,"latin":true,"category":"decorative"},"3662e757975d523f7876458b4b038958b913168d":{"cyrillic":true,"latin":true,"category":"unknown"},"f97b7098fcb68d9cf1186d36252dc260b07e7f37":{"cyrillic":true,"latin":true,"category":"sans"},"8ccce1d64c0e6224ba35d218a2c4286be1703a81":{"cyrillic":true,"latin":true,"category":"sans"},"3f86f62d42b545db895f1920f1ab3c17e7a0cb3b":{"cyrillic":true,"latin":true,"category":"sans"},"6592876626dbd975579c3e0d6ca2e2a72e00a94b":{"cyrillic":true,"latin":true,"category":"sans"},"7756da6da286dfb5761d8efe1c2983c540326d43":{"cyrillic":true,"latin":true,"category":"sans"},"cf60655c3534b3f32c44bbc28c839e73bbf28ffc":{"cyrillic":true,"latin":true,"category":"sans"},"30dbdbb4c1702bcea08e0598b958f5252d294e0c":{"cyrillic":true,"latin":true,"category":"sans"},"eaded9f8419f7cbc910e5357a742921647638fe3":{"cyrillic":true,"latin":true,"category":"sans"},"182391533cd90e6e418bcc7d038e7ade87868b2b":{"cyrillic":true,"latin":true,"category":"sans"},"6db2ce782790b8b4196cc325b0b211e77bcbd17b":{"cyrillic":true,"latin":true,"category":"sans"},"4a99ec6a3aae3e2f8feb5f6add0eeb404c623731":{"cyrillic":true,"latin":true,"category":"unknown"},"6443a40fc880696e24134a609c888b7808138c87":{"cyrillic":false,"latin":true,"category":"sans"},"93ac3ff74b15beadd1cf83ed65cf6b21bf8acdb5":{"cyrillic":false,"latin":true,"category":"sans"},"56d85453593645bfd9712d68f1cfe29384ee7fef":{"cyrillic":false,"latin":true,"category":"sans"},"a9e87fc7b807abcaf5fe9182aaf17b4a6ce18ab9":{"cyrillic":false,"latin":true,"category":"sans"},"a2e50dbea7fd239e99b71850e9a5b48923a996a6":{"cyrillic":false,"latin":true,"category":"sans"},"a280295ddf88ddd8fa7e22b8c60e0c98546921dd":{"cyrillic":false,"latin":true,"category":"sans"},"83d7ab696bfe58beac74018b44c4873fe265a5ed":{"cyrillic":false,"latin":true,"category":"sans"},"8ddd83e21901dc6469ad905b07d31de95fff3e24":{"cyrillic":false,"latin":true,"category":"sans"},"5c421c6057f995b4fe572e1cc763eed2f379eac2":{"cyrillic":true,"latin":true,"category":"sans"},"92fd20521d71eccfa848fd52ed6553db90a2b362":{"cyrillic":true,"latin":true,"category":"sans"},"eacf28f46de0602eb6a28bc2c65f7f491896e76a":{"cyrillic":true,"latin":true,"category":"sans"},"00b5cb010ca2f7b46cfc4596ebd6dd16f4d1b1b6":{"cyrillic":true,"latin":true,"category":"unknown"},"90b55d100ceb1a60d71421ee268de93edd9f8441":{"cyrillic":true,"latin":true,"category":"unknown"},"60b6535e84f47603da7ccb1628bfaa387b6abb8c":{"cyrillic":true,"latin":true,"category":"unknown"},"11f070edeaddbcb060fcf50e90087153b867677d":{"cyrillic":true,"latin":true,"category":"unknown"},"45ee404dc09dba744bd5f62431cd45a919859c57":{"cyrillic":true,"latin":true,"category":"unknown"},"e2b21412592d70bd1b1e0b81b3cc7de11c3119e8":{"cyrillic":true,"latin":true,"category":"unknown"},"8f066b62f5f2cee85f1df52c1546d13803ab4f1b":{"cyrillic":true,"latin":true,"category":"unknown"},"be2178b693848a6489220bcaf3bb048c3fefd399":{"cyrillic":true,"latin":true,"category":"unknown"},"fe1dfa86c64e1b58b6b205c1f51f5d48ef5da676":{"cyrillic":true,"latin":true,"category":"unknown"},"69539b4a09c5a753777cef200c736f1641890a6e":{"cyrillic":true,"latin":true,"category":"unknown"},"be39d4a4cdd2754b72a962c76ee76cab34dc525f":{"cyrillic":true,"latin":true,"category":"unknown"},"51eda755204f0b9f5643e61f2a386a4e011a294b":{"cyrillic":true,"latin":true,"category":"unknown"},"26bca08ef49ee4695e316897811179b679be9728":{"cyrillic":true,"latin":true,"category":"unknown"},"0f76ab69af1414f7d3514fe070d3aedb62437688":{"cyrillic":true,"latin":true,"category":"unknown"},"e20b53144d20c1f49917c875d95f842c3c3f1c0e":{"cyrillic":true,"latin":true,"category":"sans"},"038d6017d84952029c55d15a48557c6d1277f174":{"cyrillic":true,"latin":true,"category":"sans"},"664edfdefe285cf6a01e6e876f09d0aa6afaa727":{"cyrillic":true,"latin":true,"category":"sans"},"2275bfd8d2e9bcff90b1ecfe9f575e6f34878d3f":{"cyrillic":true,"latin":true,"category":"sans"},"f8e4fe14de98c7ec2639136411434ef0a0a92d1e":{"cyrillic":true,"latin":true,"category":"sans"},"4366bad3d9d11000f338e55372faac2e3925d429":{"cyrillic":true,"latin":true,"category":"sans"},"6b97ec72609e77c74f175a9376091aa5a23879ca":{"cyrillic":true,"latin":true,"category":"sans"},"54b7c3905e48ba76586f1e0ef2d20be065037924":{"cyrillic":true,"latin":true,"category":"sans"},"6ba377ae3f41993a2a1d38b356b4e2c7964b2a9f":{"cyrillic":true,"latin":true,"category":"sans"},"15b46ebaf1de07f60f360e5f6f639a81d15e09c6":{"cyrillic":true,"latin":true,"category":"sans"},"3f43cdbe103e9a0d269b06c63e68afd4e4d58364":{"cyrillic":true,"latin":true,"category":"sans"},"631f2839a80ed630e4f60a0731f37c8e24e8f0ca":{"cyrillic":true,"latin":true,"category":"sans"},"cf8a90b06388b0219922e0a388350c14b5392fff":{"cyrillic":true,"latin":true,"category":"sans"},"95bd533375ca739770304f17b07c3587cc0232df":{"cyrillic":true,"latin":true,"category":"sans"},"167487d9b4bd4db3073efe8d518b2d9f5c7e9b15":{"cyrillic":true,"latin":true,"category":"sans"},"d429299d7c5f53b1cbe240417a6aded2f1758e0c":{"cyrillic":true,"latin":true,"category":"sans"},"3d1515d5e06d6ca21c50cb5686c1728716adaa7b":{"cyrillic":true,"latin":true,"category":"sans"},"7fbb0fd2ee54a14abf21256b70de212cae9e9fb1":{"cyrillic":true,"latin":true,"category":"sans"},"e181750c57248c42b9c4f12a3a1d98c36ac696ad":{"cyrillic":true,"latin":true,"category":"sans"},"77a6f50ebdd5520e4708750d45eb039ea07437ac":{"cyrillic":true,"latin":true,"category":"sans"},"b32620c3aa564b95400bcc7794f723f009b9f526":{"cyrillic":false,"latin":true,"category":"handwriting"},"7767ad1d8d97215cdd827aa37debf1ff5a62cd82":{"cyrillic":true,"latin":true,"category":"unknown"},"ce0463230a87fc5112de9d49f23dd5ea6d2c4c27":{"cyrillic":true,"latin":true,"category":"unknown"},"e7de30de6a99c638a21f309e77995d6b76622d02":{"cyrillic":true,"latin":true,"category":"unknown"},"cf01de6bf738f20b97eb7bc69c46a408936baaa2":{"cyrillic":true,"latin":true,"category":"unknown"},"a49f88c03e7530c493eea9193f925a96f68cfae6":{"cyrillic":true,"latin":true,"category":"unknown"},"03d58dc02160be13137f688934c4521260eb9338":{"cyrillic":true,"latin":true,"category":"unknown"},"b2ae1be6a572a0720905f067e35c6aa8b53f7bcb":{"cyrillic":true,"latin":true,"category":"unknown"},"28a99a5ac86cc1dffe1ef095f391df141f38ad1f":{"cyrillic":true,"latin":true,"category":"unknown"},"4e225393888e5695a3c18e0e88c5583bea197c67":{"cyrillic":true,"latin":true,"category":"unknown"},"8c6544484920bfcda6d2eabf3f15393381970d4d":{"cyrillic":true,"latin":true,"category":"unknown"},"3a86f8fb81ec9d27e5d22641f6d773e740de45cc":{"cyrillic":true,"latin":true,"category":"unknown"},"237a4af63caa231fc852bcac79375e4dbf988246":{"cyrillic":true,"latin":true,"category":"unknown"},"57dbbba6fc80ce69c9565850c53b66d0cc6310b3":{"cyrillic":true,"latin":true,"category":"handwriting"},"f76dad73fc79a1b11b3a6c824c2e605a977afeeb":{"cyrillic":true,"latin":true,"category":"sans"},"76a71b6b31361f9cb646280b6df677ccdc230fd1":{"cyrillic":false,"latin":true,"category":"sans"},"19a7219150eac881a4aa208e274ec50249feb3b0":{"cyrillic":false,"latin":true,"category":"unknown"},"3f2d749e1a888460bfc55d2bed89f8a2570fa1ed":{"cyrillic":false,"latin":true,"category":"unknown"},"34943994b835c416e635a964aa984056ff7037f5":{"cyrillic":true,"latin":true,"category":"unknown"},"584a0b7d4a098be621f89f22f39ce7ae9c95da57":{"cyrillic":true,"latin":true,"category":"unknown"},"bb897ac5ba4d56c30d915a54398f21152c497441":{"cyrillic":true,"latin":true,"category":"unknown"},"64e56de305111807c07c521250186e56f0b27ee2":{"cyrillic":true,"latin":true,"category":"unknown"},"d935ab3f9990b358dd91dc11cd405e57240e8650":{"cyrillic":true,"latin":true,"category":"monospace"},"144f40953348e7af49c3cc63b6292b5f2129fdda":{"cyrillic":true,"latin":true,"category":"monospace"},"9ccd38ebfb736c514e0f95db7a24e3fac5e6ad06":{"cyrillic":true,"latin":true,"category":"monospace"},"bde94ddd07ba79e6d2677d06cc41ba3d29c3806c":{"cyrillic":true,"latin":true,"category":"monospace"},"0495337afa03751e2dee13bb7708cf7cb486c78a":{"cyrillic":true,"latin":true,"category":"monospace"},"eafcf956d29313c8885b9ba134dd2f430816c934":{"cyrillic":true,"latin":true,"category":"monospace"},"46143b654831a859eacfbae2ea2dc0e31eb4af48":{"cyrillic":true,"latin":true,"category":"monospace"},"17e388e807e4811f2f95a376e5316f6997ed6c46":{"cyrillic":true,"latin":true,"category":"monospace"},"199f19d71a12f56942479eb4a8d0db1ca2bc7f92":{"cyrillic":false,"latin":true,"category":"sans"},"ff3ca043ffb709571157aac5061378327f1a5d8a":{"cyrillic":false,"latin":true,"category":"sans"},"55af4b7ef411d3829f3b53ee4d14c22bec6c02ef":{"cyrillic":false,"latin":true,"category":"unknown"},"56484fa4f3c3d84f781a3558588ba920f6b14139":{"cyrillic":false,"latin":true,"category":"unknown"},"0e884c7c6fde77b96df7ae37f058e81f14495c7c":{"cyrillic":true,"latin":true,"category":"sans"},"3d2dca1b321893e1ff3393d9a77fd2c9afa3f759":{"cyrillic":false,"latin":true,"category":"unknown"},"2200f244ef9856d2897a5dfe1b2cb7ea15f771dc":{"cyrillic":false,"latin":true,"category":"unknown"},"8c7f0a955a84624ac66a35f0985191713b673ce3":{"cyrillic":false,"latin":true,"category":"unknown"},"2a412c5fc25c44f24dfd1d26447d16d40a0a2696":{"cyrillic":false,"latin":true,"category":"unknown"},"c06a5be0ca3acdabde8b67f6606619c7e031313e":{"cyrillic":true,"latin":true,"category":"decorative"},"ca93dcbcbf2f63a8fad6fb9376a89a4ffc4624b0":{"cyrillic":false,"latin":true,"category":"unknown"},"d3c9f5596f12cde8cfea16c94cfe59c7f3310464":{"cyrillic":true,"latin":true,"category":"unknown"},"d4373b1c6c11b177dd5e7883106d5bb7e23ae9c2":{"cyrillic":true,"latin":true,"category":"unknown"},"9294edd02b38bfd9f4f825a1a82c2eb47a3aedc2":{"cyrillic":false,"latin":true,"category":"unknown"},"e19884befbf84588b355ddb9a7fc3b87db55d132":{"cyrillic":false,"latin":true,"category":"unknown"},"b9db706818e9a7c98089a88f0e01a19343e5ed10":{"cyrillic":false,"latin":true,"category":"unknown"},"7075f68534dacccaa24742e3f728b5a6835881ad":{"cyrillic":false,"latin":true,"category":"sans"},"f084d268cbdfd8b5069b1a1721f8cc329954fbfa":{"cyrillic":false,"latin":true,"category":"decorative"},"0d161b4be9fa007d66ccd4a2ecb2538f6634d7c6":{"cyrillic":true,"latin":true,"category":"handwriting"},"42636e8ec4d8fd414c7635f791f011bc044ed76b":{"cyrillic":false,"latin":true,"category":"unknown"},"1124627a3361da5b3ded8704dd3356de0d3501c5":{"cyrillic":false,"latin":true,"category":"unknown"},"20ce04c63d6ead2b9c3d24eba36add76e854a1c5":{"cyrillic":true,"latin":true,"category":"sans"},"4b1839e447858c62ea970bf0bc4a0b7bc0b7d9be":{"cyrillic":false,"latin":true,"category":"unknown"},"d9245245692a51cd32da455fff188a96241567d8":{"cyrillic":false,"latin":true,"category":"unknown"},"e85af67c01e2ff737d12e70800badb1121d413db":{"cyrillic":false,"latin":true,"category":"unknown"},"a452e0cc6f0edbb367c428bef6e5c9dc8464ff15":{"cyrillic":false,"latin":true,"category":"unknown"},"cf1316086b46ded91b0038b0af2ab142d9c48706":{"cyrillic":false,"latin":true,"category":"unknown"},"a6c0484543094229e6e5d37eb463adfd8107cb80":{"cyrillic":false,"latin":true,"category":"sans"},"69a9aa9c27503ed606f9bb6556d3af5d4c4580f4":{"cyrillic":false,"latin":true,"category":"unknown"},"02cd9992481bce89b10634ef5347b37e2dbe5aab":{"cyrillic":false,"latin":true,"category":"sans"},"9bc3f686710bca62a2540e9ab9c1a8a16fcaee23":{"cyrillic":false,"latin":true,"category":"unknown"},"dee8d9ef8dca22442a46ce58074fee0ca54b62df":{"cyrillic":false,"latin":true,"category":"sans"},"94db85d9159268f36d81b28cdb51ba6c42a25515":{"cyrillic":true,"latin":true,"category":"unknown"},"37428a25f05ca7673cf151dc7167dd86dc6b290e":{"cyrillic":false,"latin":true,"category":"unknown"},"3e53c3a47327a3e2db03012a37ca1229d90575c1":{"cyrillic":true,"latin":true,"category":"unknown"},"eb32cb9d9b362803f7876389a3d0867a4a42fbb4":{"cyrillic":true,"latin":true,"category":"unknown"},"b964e3a45798b89b9bfd76adb4d6cb86aeb52431":{"cyrillic":false,"latin":true,"category":"sans"},"36eb575e34070fe8abeebaaaeab16f31bb160fe4":{"cyrillic":false,"latin":true,"category":"unknown"},"5e92d615b9ba4b06d41b87ad6e8b3ccb5c545b30":{"cyrillic":false,"latin":true,"category":"unknown"},"809cb65b5841628558357ecabf000440d5c1493e":{"cyrillic":true,"latin":true,"category":"unknown"},"f6115cf2915f7c16160e4329ef77b7fdf4ecbfc7":{"cyrillic":false,"latin":true,"category":"unknown"},"002cb3bb0e5be75f0e344ff833e60923f5f545ff":{"cyrillic":true,"latin":true,"category":"unknown"},"3168d5346b8a3c4897f37df5b58c9e0dc3f9a4d4":{"cyrillic":false,"latin":true,"category":"decorative"},"5ae6bd268a624108a2fc6de8ccf8fd98d1ffe5e7":{"cyrillic":true,"latin":true,"category":"unknown"},"06bf07249e268d9a73fae0d52024dae8a4d3d37b":{"cyrillic":false,"latin":false,"category":"unknown"},"d44f5b9641a023ce2b4245c6796767e18640eea8":{"cyrillic":true,"latin":true,"category":"unknown"},"30625134b5f99df1a59b4581622438ab29ccc25f":{"cyrillic":false,"latin":true,"category":"handwriting"},"d380a60a49e798f420479578aed55e2ea2c45427":{"cyrillic":true,"latin":true,"category":"sans"},"6435df188229be1f6144b9a7895106d254e628e5":{"cyrillic":true,"latin":true,"category":"sans"},"aba29e5af95838a02188dcf338f0d306e0ec3fdb":{"cyrillic":true,"latin":true,"category":"sans"},"0c83728887525b4926abbdc3d63d7b2c038aea85":{"cyrillic":true,"latin":true,"category":"sans"},"858b0231fc60beb34f8ee32632f475504b995428":{"cyrillic":true,"latin":true,"category":"serif"},"4f0632214afd4eda8bc5d8b63a662e2acf3b8a63":{"cyrillic":true,"latin":true,"category":"serif"},"6c58c0a21cc8a7e0c36b4aaab4651df4659d6fde":{"cyrillic":true,"latin":true,"category":"serif"},"13c7467fd05c3cbb883cdae303c5f1cb8411c55b":{"cyrillic":true,"latin":true,"category":"serif"},"bc3d0844ad2cc5f8c41273063942faa643ece7c2":{"cyrillic":true,"latin":true,"category":"monospace"},"567817eeef0daf3f53c04977bb6b501167f075f2":{"cyrillic":true,"latin":true,"category":"monospace"},"1dc1362ce70c29305a43f2517fea8923e68cfed7":{"cyrillic":true,"latin":true,"category":"monospace"},"89137dab3ac736a0de45faf11742b828c968ba69":{"cyrillic":true,"latin":true,"category":"monospace"},"39d3804ce98be5c535cce2add2eaaba6d3961804":{"cyrillic":true,"latin":true,"category":"sans"},"5156dbd46becdb18d7094894c54bd79a74c4d78f":{"cyrillic":true,"latin":true,"category":"sans"},"6c3d1e5a783f59e24371ea4cb3f1b2cc83092f3f":{"cyrillic":true,"latin":true,"category":"sans"},"af8e556ff0335d8e45f6e1a3a49494c46d599519":{"cyrillic":true,"latin":true,"category":"sans"},"89693c8bbb04cdac8431611f357f4cc3493de159":{"cyrillic":true,"latin":true,"category":"sans"},"1bb6a8a18b8c52088e0a9922ba35e24a6dedac95":{"cyrillic":true,"latin":true,"category":"serif"},"e45d88fc7f5d16515f1891d7e6bd7081a531f7d6":{"cyrillic":true,"latin":true,"category":"serif"},"ec7ebfa848852b9264ee7138b08b04d9ec847b97":{"cyrillic":true,"latin":true,"category":"serif"},"f9ce8c0e4d412be9691730708d5c59f264834f56":{"cyrillic":true,"latin":true,"category":"serif"},"1f5f57667cf92186048abc70db50381cc44a582e":{"cyrillic":false,"latin":true,"category":"unknown"},"3ff300cfec337e3f3307053ce545b419fb5341ed":{"cyrillic":true,"latin":true,"category":"unknown"},"f0dd7b90e71f46c98bdbd303708d64f8dfc4474c":{"cyrillic":false,"latin":true,"category":"unknown"},"d4e57d19dfbf0d61409c51fb6a144acd97faefd4":{"cyrillic":false,"latin":true,"category":"unknown"},"678ecd46b5a69846f670738debdc8e8eb7209365":{"cyrillic":false,"latin":true,"category":"unknown"},"8f71058160e76944a06ebf20a5515c60b612992c":{"cyrillic":false,"latin":true,"category":"unknown"},"ea389fcd89f04d6b327cc18698152fcf00bc1cb4":{"cyrillic":false,"latin":true,"category":"unknown"},"2067b15a616eae6340dd9809a80c6c8a4cd82e1c":{"cyrillic":false,"latin":true,"category":"sans"},"b24991a85b2cc72d92e79ada3dc4cd5e698d7736":{"cyrillic":false,"latin":true,"category":"sans"},"879384a8b18372884c6c9cfd578f3e5b0e087c39":{"cyrillic":false,"latin":true,"category":"sans"},"f2f260e879ab0c1ec02abdc77a81a22c7db3560c":{"cyrillic":false,"latin":true,"category":"sans"},"7be1277698b4ee5e5dfc3bdde22bb8b9fd355bc3":{"cyrillic":false,"latin":true,"category":"sans"},"7c69725f3ff0e999d5566245688630c4a1f2d1ca":{"cyrillic":true,"latin":true,"category":"sans"},"acf441bcf0990e8d83350188ffd90e0dfe679903":{"cyrillic":false,"latin":true,"category":"serif"},"a42bd7de8196ffc41ee288c3d1b0da167342d85a":{"cyrillic":false,"latin":true,"category":"sans"},"9d606e5b60318e4b53c4068081367dc42a63e8f8":{"cyrillic":true,"latin":true,"category":"unknown"},"2cacf716740c9c0026c9544ff8b350c88697af97":{"cyrillic":true,"latin":true,"category":"monospace"},"ddae73c5ae8045f70c64d418e41aa20eb0d1fdaf":{"cyrillic":true,"latin":true,"category":"monospace"},"f7864ea8a54e2ca43030329a80fc242c346fdd9b":{"cyrillic":true,"latin":true,"category":"monospace"},"9827ec1cda4a97ecce1dd639b5052a7cb97e7942":{"cyrillic":true,"latin":true,"category":"monospace"},"9e8628358f5015d8dab4f3f8cde0737237120637":{"cyrillic":false,"latin":false,"category":"monospace"},"013aeef68455c75c4459f764e153923eda743327":{"cyrillic":true,"latin":true,"category":"monospace"},"4862412bfb065f6fef6667c535664c8ac0176330":{"cyrillic":false,"latin":true,"category":"unknown"},"660d5e47e0621f2be47bd5a8312dffc452cd4e5b":{"cyrillic":true,"latin":true,"category":"handwriting"},"6cca225c3824fd9842351335fc5b66ebdec83863":{"cyrillic":true,"latin":true,"category":"unknown"},"c85b39c013c87821fea9467c8311001b6eff632f":{"cyrillic":false,"latin":true,"category":"unknown"},"c8704e3d09771fa7575d2f39810f0f4357e87747":{"cyrillic":true,"latin":true,"category":"unknown"},"469fc1e49dd3e17a797c0501559944ce4b5afc0b":{"cyrillic":true,"latin":true,"category":"decorative"},"0946d49f323d307f0b94d3f41984e29b116e8172":{"cyrillic":true,"latin":true,"category":"decorative"},"e9a935bb2c4366b7b356b71ae5f10fd514025d5b":{"cyrillic":true,"latin":true,"category":"unknown"},"c9af83242460513b8c1dd225cc147ac293645011":{"cyrillic":true,"latin":true,"category":"unknown"},"7591f18ea96df33559b12766420961626b637f53":{"cyrillic":true,"latin":true,"category":"unknown"},"8ff6175459cacb017086d74f02e2e71eafea4f53":{"cyrillic":true,"latin":true,"category":"unknown"},"0ec7a614c548ca396bfd0e49e2192d1f08fcb083":{"cyrillic":true,"latin":true,"category":"unknown"},"814681fb148d0d2042e0d018e829d3b165f71873":{"cyrillic":true,"latin":true,"category":"unknown"},"103535a19edc593ee4b83ee69f15a55c689c22ac":{"cyrillic":true,"latin":true,"category":"unknown"},"703983f1672b31075dd348d88b04201c979998c5":{"cyrillic":true,"latin":true,"category":"unknown"},"0d9aba7cdc779f73f7dbc8ca9d6ff62826fed902":{"cyrillic":true,"latin":true,"category":"unknown"},"14241cbe6a13e2f580a3b420e3b05440e9ff4695":{"cyrillic":true,"latin":true,"category":"unknown"},"fa929cf8f7365bb22acc2f17b22fdc317cee6d71":{"cyrillic":true,"latin":true,"category":"unknown"},"231ff0270c52f0557b58c91abb87e94f423ec0fb":{"cyrillic":true,"latin":true,"category":"sans"},"b2ff32766b7e9a5a8e2dbd6ce89598f426ec24c0":{"cyrillic":true,"latin":true,"category":"sans"},"c6e92796241cfd71f77e2def7fac5f8a9eb1d8aa":{"cyrillic":true,"latin":true,"category":"sans"},"adb8356e304c16b755425b5bb4441c22a7e17cbd":{"cyrillic":true,"latin":true,"category":"sans"},"dbfcb5e594db720a36f0df1ab33213ad4203ebae":{"cyrillic":true,"latin":true,"category":"sans"},"7246ae5aabddb91f42031603b51e4498bc0d3db0":{"cyrillic":true,"latin":true,"category":"sans"},"ae25b1ea27834d5f242cc7e91fbb564069a22cc1":{"cyrillic":true,"latin":true,"category":"sans"},"c4b794781a3c2b72538e1ec773fd6d2e393c7aa4":{"cyrillic":true,"latin":true,"category":"sans"},"0b4719b43bcb5cf4d641a1e10be067c83eac959e":{"cyrillic":true,"latin":true,"category":"sans"},"9e57afd6be2c889d7571f38eb51a3705f2f0e794":{"cyrillic":true,"latin":true,"category":"sans"},"fb2dceaef030a938479d877db739c1016858c1dc":{"cyrillic":true,"latin":true,"category":"sans"},"a3ade380241eafb9e6c9584b4f5fcae43cc46081":{"cyrillic":true,"latin":true,"category":"sans"},"66f69606211fa89d3f9fb8baf537577fc65816d5":{"cyrillic":true,"latin":true,"category":"sans"},"5ee0caf51d9018a63ebcdb03b37ef1789e9a0be6":{"cyrillic":true,"latin":true,"category":"sans"},"576c735c1a4970b2ef4c4f883a63bc7dfdc08dd6":{"cyrillic":true,"latin":true,"category":"sans"},"1b2fd5d466bf6f36fe11669044b386f697341b32":{"cyrillic":true,"latin":true,"category":"sans"},"42570dfdb3473b76ddba91150856e950f3cb8ed0":{"cyrillic":true,"latin":true,"category":"sans"},"1c69908ea0aa22cdc64abd9d85da9a333d7df8ec":{"cyrillic":true,"latin":true,"category":"sans"},"5b5d47f464061c9de9a52219947759f85db1033a":{"cyrillic":true,"latin":true,"category":"unknown"},"17099ca1d1ebd32defa5e1bf914b0e89af640838":{"cyrillic":false,"latin":true,"category":"sans"},"e9102c685688064ac5bb224451d81929ebb6cbb3":{"cyrillic":true,"latin":true,"category":"unknown"},"f8509324983c98a1fc92213177bd13fed54cc1fd":{"cyrillic":true,"latin":true,"category":"unknown"},"25120de25757487871cebd636e57c9842fd213e6":{"cyrillic":true,"latin":true,"category":"sans"},"7ad3eb5160dd0f393aa83e75f0f0e04406f7d8ea":{"cyrillic":true,"latin":true,"category":"unknown"},"9bc26ad8e4fc1b19e53c7dbe7fdd6812f578ea5e":{"cyrillic":true,"latin":true,"category":"unknown"},"20c9e87fec6b3a2bbd420f3eca4a04a6ad2be5e6":{"cyrillic":true,"latin":true,"category":"unknown"},"1120c1608d1bac2287e2880fc779787ad48c6d91":{"cyrillic":true,"latin":true,"category":"unknown"},"5ba948c27ebaa3d4b00fac046f39a17b9473398e":{"cyrillic":true,"latin":true,"category":"unknown"},"c0e2d62020528e32188079b34b320835927a64ac":{"cyrillic":false,"latin":true,"category":"unknown"},"95927556a0aaf49b2d50e97770f2895f825d1779":{"cyrillic":false,"latin":true,"category":"sans"},"740d7d5539d3f649715eedb96286e8c7435e3b57":{"cyrillic":false,"latin":true,"category":"unknown"},"12347cc488a519ae529f3e48d201cbc146060c94":{"cyrillic":true,"latin":true,"category":"unknown"},"e4d3957f721b6f58486da6469baac90a6ec59c89":{"cyrillic":true,"latin":true,"category":"decorative"},"c183a9149313873aa72ddca6d36936233ede0684":{"cyrillic":true,"latin":true,"category":"decorative"},"7d062d06aaa6a6c30ef6ae5f411e34f848955350":{"cyrillic":true,"latin":true,"category":"decorative"},"2a0a32180ebc9f0eef1c288f06deffd553626651":{"cyrillic":true,"latin":true,"category":"decorative"},"e65aead28ed5e18434e2bd9f963cc449d0ac376e":{"cyrillic":true,"latin":true,"category":"decorative"},"8b3d56cc9afefcec5fa71671e296ad9bc0ffd853":{"cyrillic":false,"latin":true,"category":"sans"},"8219a00ac974030b116d277b313c2890429c748b":{"cyrillic":true,"latin":true,"category":"handwriting"},"28e553cd5a9e7dd448264561e61821a78026ded5":{"cyrillic":true,"latin":true,"category":"handwriting"},"d5ddaed9be7416c408f18aa049d754a927e7d5f7":{"cyrillic":false,"latin":true,"category":"sans"},"d2dedce323fe6b1744395f57691a0ab8bf533307":{"cyrillic":false,"latin":true,"category":"sans"},"260afd51ee7e0bbb15b4cd69c07755444ea48382":{"cyrillic":true,"latin":true,"category":"unknown"},"18792537b83d4dd757964013db1d839327a86a33":{"cyrillic":false,"latin":false,"category":"unknown"},"983715d54c41111554e115291805d1588ff26621":{"cyrillic":false,"latin":false,"category":"unknown"},"9caf714969314c24b995b15531acbe2c5dd6f4d7":{"cyrillic":true,"latin":false,"category":"unknown"},"a18c02744c4f0f02cc7c90c721d8e8401e90c3b1":{"cyrillic":true,"latin":true,"category":"handwriting"},"557f2291ddaf14cf2fb350c1776aa1dad73e0250":{"cyrillic":false,"latin":true,"category":"unknown"},"4129c97b63ed00942a3c088f880172f60121b592":{"cyrillic":true,"latin":true,"category":"unknown"},"85bc8ac58ff582364b58c55ecec2095afa0126f3":{"cyrillic":true,"latin":true,"category":"serif"},"62b70f013b2af92011bbced30d5c055f27fe6be9":{"cyrillic":true,"latin":true,"category":"serif"},"b276a6c4e0b12a913ac62ab782b2a9de3226f402":{"cyrillic":true,"latin":true,"category":"serif"},"feccaa9a248447cb113d8480d6b7b761fe01a162":{"cyrillic":true,"latin":true,"category":"serif"},"24e41f10cdfaaf5e07cd99c2f9e7491bdd7d737d":{"cyrillic":false,"latin":true,"category":"unknown"},"121259aae930b4f1875d9504b7e497b51e8ec471":{"cyrillic":true,"latin":true,"category":"unknown"},"2a587b12c0d51398ab0eff3c1164e8b02ee62934":{"cyrillic":true,"latin":true,"category":"unknown"},"79b2571841b209a589726af3b70dc7403ba99c1f":{"cyrillic":false,"latin":true,"category":"handwriting"},"94647161b57d7a4e8e31171773133fdc352c2661":{"cyrillic":true,"latin":true,"category":"serif"},"a74be67d4312c9459d1d9f2beca1fa72e3c6be6a":{"cyrillic":true,"latin":true,"category":"unknown"},"d70a701615f89d546b953e821c4b6ac3b65952bc":{"cyrillic":false,"latin":true,"category":"handwriting"},"2de63d21514b02b65d9872a0ad620fdd30146680":{"cyrillic":false,"latin":false,"category":"handwriting"},"5acab2d1b1b6a0a6f85ffd099c5057603d8f3070":{"cyrillic":true,"latin":true,"category":"unknown"},"1e156b470631c66484db6d17fe71b61c17e75b87":{"cyrillic":true,"latin":true,"category":"serif"},"4ac280b9c15e5c91ac2cd1c656f56d723cc239e9":{"cyrillic":true,"latin":true,"category":"serif"},"ec45b336157017bd3aeab6c695ef8e9609f2773e":{"cyrillic":true,"latin":true,"category":"handwriting"},"f55a36cb379229d46bfd40ec3c054e1fc309d533":{"cyrillic":true,"latin":true,"category":"handwriting"},"42799d2eca5477fffbe852fa7669502e5ea3f6c5":{"cyrillic":true,"latin":true,"category":"handwriting"},"123e62d864b2db13b2dbbb6c6c7157cd1073f95e":{"cyrillic":false,"latin":false,"category":"serif"},"40dfbf381a33b49d7c5ab4de97d7c4adbd622896":{"cyrillic":true,"latin":true,"category":"sans"},"70e7e6f81589eec09b3a9fed26e7777dca992fd6":{"cyrillic":false,"latin":true,"category":"sans"},"779abd3de132fbd3cd9f7997f3bf1c4db5b02c35":{"cyrillic":false,"latin":true,"category":"sans"},"56fd5784686de71b51cf7821f1372e05e7d51b60":{"cyrillic":false,"latin":true,"category":"sans"},"7d0d196aee6b304e806404aa03ede67083cd749c":{"cyrillic":false,"latin":true,"category":"sans"},"dfadce6ce7daa87077cca06f9177bfbf8693e01a":{"cyrillic":false,"latin":true,"category":"sans"},"a566252b5d6c98c007e81ef0c338c0121ec123ed":{"cyrillic":false,"latin":true,"category":"unknown"},"acc7599c8fce6265f8159184ef8c42198ce9087e":{"cyrillic":false,"latin":true,"category":"unknown"},"54c6394970c5de33b3dc9f09b109195465dbcd08":{"cyrillic":false,"latin":true,"category":"sans"},"d6c4d72f47ef542bb70561db433d5ebcc8856ec1":{"cyrillic":false,"latin":true,"category":"sans"},"e2a2ff0e35c4d58d724e086e6cb8b8e9e7e009c9":{"cyrillic":false,"latin":true,"category":"unknown"},"3099a83891f6d8d86332dd8dea2047b5279ddf12":{"cyrillic":false,"latin":true,"category":"handwriting"},"18345e6ce7804acd5a827b75dc87c4a8322cdb9e":{"cyrillic":false,"latin":false,"category":"unknown"},"1c17d2fbcc8e855add847330eb29baf5341eb1ec":{"cyrillic":false,"latin":true,"category":"unknown"},"7a1aee51e5ceaa8e8a01c8e0b75d1d6dc96fc40d":{"cyrillic":false,"latin":true,"category":"unknown"},"a2fb0607fac332f9f483e9702bf6cbeaf666dad4":{"cyrillic":false,"latin":true,"category":"unknown"},"84b2a15f37c5c346b7d424d62b464a0b33a61551":{"cyrillic":false,"latin":true,"category":"unknown"},"3ea597d5fafdd7a234df4b8e41ac21bbaa85e94a":{"cyrillic":false,"latin":true,"category":"unknown"},"cf7a047e50a8dca0170b122f8cb7a72327cefce8":{"cyrillic":false,"latin":true,"category":"unknown"},"721a61f580d7115cf003f7b72c262a2f3a22b5f8":{"cyrillic":false,"latin":true,"category":"unknown"},"bda2fa0bca804ba7a46a1e395444554723c5d5ea":{"cyrillic":false,"latin":true,"category":"unknown"},"4b77e538680aa5982f8f4335af2b52bb8cd6eec8":{"cyrillic":false,"latin":true,"category":"unknown"},"16cecf8dc2b35a259d1d9acd5bc72ed1f9cd0747":{"cyrillic":false,"latin":true,"category":"unknown"},"980025d31618ce851215a0ebf7050985c6dc7371":{"cyrillic":false,"latin":true,"category":"unknown"},"3b02ef9919b79f32402ac3c21afb57b77efec190":{"cyrillic":false,"latin":true,"category":"unknown"},"6ec8c13c713ec45946d6953aeeda3c90f06bdf5c":{"cyrillic":false,"latin":true,"category":"unknown"},"c970e681853e335c21eea556ef5c00e61a410c23":{"cyrillic":false,"latin":true,"category":"unknown"},"e317fae816db1620ca79386c3ec29c0d7acca4c9":{"cyrillic":false,"latin":true,"category":"unknown"},"5747abe172df83baa3de6f45747cb5e5418b726c":{"cyrillic":false,"latin":true,"category":"unknown"},"7f1d5d64bb8f0683555f14f1786456f33f40e1e6":{"cyrillic":false,"latin":true,"category":"unknown"},"58599f110d087fca92fef600dc9707ed65d24025":{"cyrillic":false,"latin":true,"category":"unknown"},"838df98ed9069b691471210ba0323bb806604475":{"cyrillic":false,"latin":true,"category":"unknown"},"0a40915458c143928acbb604745aefde988f7cc2":{"cyrillic":false,"latin":true,"category":"unknown"},"e765b04784fcfedaeb28ae5c9d751124e455a9ed":{"cyrillic":false,"latin":true,"category":"unknown"},"f0c6b397cca733fe3bd77c51c8df3e4f77705a23":{"cyrillic":false,"latin":true,"category":"unknown"},"c3c78bfa4e9b61c067afc096b197643e20248790":{"cyrillic":false,"latin":true,"category":"unknown"},"420369663472f519929190fa6ff97a0c402e17b5":{"cyrillic":false,"latin":true,"category":"unknown"},"43062377777c1664dd9b6b376a991983189b81f0":{"cyrillic":false,"latin":true,"category":"unknown"},"746238bf95437f7c2682f2dc306163612c641010":{"cyrillic":false,"latin":true,"category":"unknown"},"d4321425cbb0022d65e9488609a92944b7614699":{"cyrillic":false,"latin":true,"category":"unknown"},"30f5dea188fb183ec238a988f25001ef403638f8":{"cyrillic":false,"latin":true,"category":"unknown"},"714c61dfc9cc7117393847614ace56e40b347f6c":{"cyrillic":false,"latin":true,"category":"unknown"},"87046338b8770facf257dea95662a073ad86bf71":{"cyrillic":false,"latin":true,"category":"unknown"},"8daa569a4985272c59efd0f9c047d89c45f61ebf":{"cyrillic":false,"latin":true,"category":"unknown"},"f21e8be7176a78f7bc907349b13a28a2f5b249a5":{"cyrillic":false,"latin":true,"category":"unknown"},"7adde56c5214ef98c54bc9f720d168134dea6f62":{"cyrillic":false,"latin":true,"category":"unknown"},"5c73040761de789382cc4a14d07ca7728b532a90":{"cyrillic":false,"latin":true,"category":"sans"},"e055877fae33f9038e6ca5ea80f3720d4bcb5dd9":{"cyrillic":false,"latin":true,"category":"sans"},"82027a720bab1ea6544e0011bd7254337bcd6586":{"cyrillic":false,"latin":true,"category":"sans"},"44d38f40d76945b552b532c8025b23f2686a1b9d":{"cyrillic":false,"latin":true,"category":"sans"},"1676247132f9d24945cc6228336e7d23e9c6adb9":{"cyrillic":false,"latin":true,"category":"unknown"},"4f1489fd4d766638ca2edced7a0a1994389533c0":{"cyrillic":true,"latin":true,"category":"unknown"},"6c3f6069b6fabf9b26df230c95171d5a08628ace":{"cyrillic":false,"latin":true,"category":"unknown"},"aa04d27b3762d2bdd40fbcd3d90f86642c537bc6":{"cyrillic":false,"latin":true,"category":"unknown"},"5b53cc9d9bae9071b042e99732314fb753575ec8":{"cyrillic":true,"latin":true,"category":"unknown"},"217e29698dfef063f5aff36b96cd5439a9ea517e":{"cyrillic":true,"latin":true,"category":"handwriting"},"3480b0d102e2d0f04895b9b0df55bf646d4a39f2":{"cyrillic":true,"latin":true,"category":"handwriting"},"283e70c85189f74185e079d197fe89775ce29b2b":{"cyrillic":true,"latin":true,"category":"unknown"},"4e5d2d066ee25449970f9f7bd91c6cb25420425d":{"cyrillic":true,"latin":true,"category":"unknown"},"6e721c6f89b9f3d1e186815cd6c869d5c16db601":{"cyrillic":true,"latin":true,"category":"unknown"},"5fff4b69a2c957324336003147826b888b1f13d5":{"cyrillic":true,"latin":true,"category":"unknown"},"ef77a93a10de13e0fc2c711edb9cf0c7e0509440":{"cyrillic":true,"latin":true,"category":"unknown"},"a28e16ad4bf89e26773aab057a1d9448c8fa484b":{"cyrillic":true,"latin":true,"category":"unknown"},"24e0622d1dba9c20048ff682d9a79979b90aa4c5":{"cyrillic":false,"latin":true,"category":"unknown"},"989927adb6433503d357c319cc68c83e99794df8":{"cyrillic":false,"latin":true,"category":"sans"},"ab4c6e8c19aa80420e157910894fce76386edfbb":{"cyrillic":true,"latin":true,"category":"unknown"},"cf4bf8025e73ab87bfe2cdcedf27716ce535678e":{"cyrillic":true,"latin":true,"category":"unknown"},"3178c5a0217b49c88937334043cf6fa784e46409":{"cyrillic":true,"latin":true,"category":"unknown"},"da523fa774dfb85b9a969d66db6b5f4300d0ae48":{"cyrillic":true,"latin":true,"category":"unknown"},"298d6b3525eb7d8ff9e3b23bc01b190b224c1233":{"cyrillic":false,"latin":true,"category":"monospace"},"e6f979eb0c6ef131eb3c952e63551141641bf69f":{"cyrillic":false,"latin":true,"category":"monospace"},"7963ea77a1d1341806068632c2d0bd33cb8110ce":{"cyrillic":true,"latin":true,"category":"unknown"},"58e28f7d01f56ef3300a4ae6fee1d5ce4b2ff8e5":{"cyrillic":true,"latin":true,"category":"unknown"},"80a02424b57c5a7452032b4d19d1e23928239299":{"cyrillic":true,"latin":true,"category":"unknown"},"0b5a16eb9c57bef8477b4fc71bc993477b2e56b0":{"cyrillic":true,"latin":true,"category":"unknown"},"048bc02e453638c4a5cc2f22d40bc488bb9ff87e":{"cyrillic":false,"latin":true,"category":"serif"},"a12e8ab0e3f58b8941b171f430fe7e510425d7a6":{"cyrillic":false,"latin":true,"category":"serif"},"a4e4b3e4b5d17e0ccf0a287a30db0bbcbfed5b34":{"cyrillic":true,"latin":false,"category":"sans"},"ddc7656b0ecacb417be4503fe890fa4e0bf97954":{"cyrillic":false,"latin":true,"category":"handwriting"},"c583464afbcf519619ea6b84427c62a13201b009":{"cyrillic":false,"latin":true,"category":"unknown"},"593e12bc295f6db6e1ce5959ffd2fcc5a5fd3839":{"cyrillic":true,"latin":true,"category":"unknown"},"19108412c496c6e910b4506236120effdf90a40c":{"cyrillic":true,"latin":true,"category":"handwriting"},"a940bf9d432869bb16e219744b5ebf584ab4abde":{"cyrillic":false,"latin":true,"category":"unknown"},"794ce358233edd46cf350934aca86d9cfd757d78":{"cyrillic":false,"latin":true,"category":"serif"},"2c2d3dd25ab9356fab0d204a276ca3237b966f09":{"cyrillic":false,"latin":true,"category":"decorative"},"9fec3d6372d4e1a38d574b8c3d5cddbc738e69bd":{"cyrillic":false,"latin":true,"category":"unknown"},"c05b35383b122e066fc0248c4e7769827400b718":{"cyrillic":false,"latin":true,"category":"serif"},"d424b9c4d5c72f7290b98c0cac26c5c2a614c33c":{"cyrillic":false,"latin":true,"category":"unknown"},"e05a0b6f434f87fbd3df1b1643b183879603a19b":{"cyrillic":true,"latin":true,"category":"sans"},"228d1dc8262eeaf3ccd6eff6cf7764adc2c240a4":{"cyrillic":false,"latin":true,"category":"sans"},"bc537caba49f0cc6901b1ad3f59fd3b4ec6d8109":{"cyrillic":false,"latin":true,"category":"sans"},"8ce9214aec04f60723179fd4aacab691039cf4eb":{"cyrillic":false,"latin":false,"category":"serif"},"02edbe726c86e90c095514ae68b6446d816df837":{"cyrillic":false,"latin":true,"category":"sans"},"b42a65e8f1e2a490046347c154f87e5d09a10f94":{"cyrillic":false,"latin":true,"category":"sans"},"c000d4b6cbd3d88b3ca5423391f38a1c80a942d4":{"cyrillic":false,"latin":true,"category":"unknown"},"33ea263b4ffd4145c84a82749e33c9a828b962f9":{"cyrillic":false,"latin":true,"category":"unknown"},"96afeb20e7c73fbd7588a2cd9e91b42bd6e2b43a":{"cyrillic":false,"latin":true,"category":"unknown"},"f0c5c3b8f3b33dfff2d820bdf13786d7c117acf9":{"cyrillic":true,"latin":true,"category":"handwriting"},"6f9a034182b79cb761561a2c7ccb68162cbe741d":{"cyrillic":true,"latin":true,"category":"handwriting"},"5e441454405ee6ed05b71604a288e850741ff53c":{"cyrillic":false,"latin":true,"category":"unknown"},"9425dceb2218e1e27e5b31a275a4eb829c39f78f":{"cyrillic":false,"latin":true,"category":"sans"},"15f23004ddfeed916fb30b3e09389f84f13f496d":{"cyrillic":true,"latin":true,"category":"sans"},"b98fa63df2310a7cedd4b7392a14c416630ff340":{"cyrillic":true,"latin":true,"category":"sans"},"73f740e7f7d0ab9045b4dbb51c76fa2333509de1":{"cyrillic":true,"latin":true,"category":"sans"},"b8599ead0aa5f334bc0f79891c4f7488fe92e778":{"cyrillic":true,"latin":true,"category":"sans"},"4f1fcd29ea9675e808e4c84cef6f73d2e19ccdab":{"cyrillic":true,"latin":true,"category":"sans"},"0e8bdc84f5d197b59d435f9832537728ebc78bda":{"cyrillic":true,"latin":true,"category":"sans"},"e4ad53613350239053f845e657fba42c47d4d092":{"cyrillic":true,"latin":true,"category":"sans"},"72ee11fd0708844c627442b474a0d5cbc739cd37":{"cyrillic":true,"latin":true,"category":"sans"},"eb134b0defb5b6ad97aa4e70ca2710ab4e79a864":{"cyrillic":true,"latin":true,"category":"sans"},"9e88c396071bc03bf5580edbc51e544f1186770a":{"cyrillic":true,"latin":true,"category":"sans"},"ff907fbc6b19d100c1557e4dd8b69d034ef72617":{"cyrillic":true,"latin":true,"category":"sans"},"c4ea8e1229a5c690c47bcfe0fd6881354e9c7f21":{"cyrillic":true,"latin":true,"category":"sans"},"f469e889ca1e8708afe8d0b9c037e66fa37734d5":{"cyrillic":true,"latin":true,"category":"sans"},"6464f469fa57765450d61e358c0a21e744643b03":{"cyrillic":true,"latin":true,"category":"sans"},"05de146614d33941e6d32f7ff5839bf3bcfb69e1":{"cyrillic":true,"latin":true,"category":"unknown"},"78855d10a2b8b78bbe0c3cf4738449d21aa5b4fc":{"cyrillic":false,"latin":true,"category":"unknown"},"01b33697e346f08c7628133a003994345453e7d9":{"cyrillic":false,"latin":true,"category":"handwriting"},"b62bfd6b6b79c3fa1bd903a80c97bdda35292173":{"cyrillic":true,"latin":true,"category":"sans"},"c1b359815f6d6d551c9f923556db2fa4953c6dee":{"cyrillic":true,"latin":true,"category":"sans"},"ca991b64e3e08cddee965df0582c9db8a5a9e999":{"cyrillic":true,"latin":true,"category":"unknown"},"97e20ed9c953e45d76bfc1e2c9233a495e461a85":{"cyrillic":true,"latin":true,"category":"unknown"},"2feb62714f700225e0bbfb859d829ef8d8210343":{"cyrillic":true,"latin":true,"category":"handwriting"},"6d13605e446d58beb934818d78f394a266ca0044":{"cyrillic":false,"latin":true,"category":"sans"},"ed1c6c24aa861cb4843c46ff9703abcb1bb23db3":{"cyrillic":true,"latin":true,"category":"unknown"},"7d370d5aec50c729ed095d0b68f66e8273d0258d":{"cyrillic":true,"latin":true,"category":"unknown"},"4ce132c68fcbf46ca7b781e063381657bac178af":{"cyrillic":false,"latin":true,"category":"unknown"},"aa77ace0b109469b34332d2033550930e7390879":{"cyrillic":false,"latin":true,"category":"sans"},"2738104a2b4a4e4e23fd944b9db076ae250d9b4a":{"cyrillic":false,"latin":true,"category":"unknown"},"b1a44dfd67d5b706d7093dd615163091d8aeca6a":{"cyrillic":true,"latin":true,"category":"unknown"},"c0e272f8f9f9e9177fbfce0359f7c6db8f8bb739":{"cyrillic":true,"latin":true,"category":"unknown"},"909e05662d31174f11d1b97106400a8418bc7d76":{"cyrillic":true,"latin":true,"category":"unknown"},"1de0d608b15afd93049f29c6863500aace9a2e1f":{"cyrillic":true,"latin":true,"category":"unknown"},"d8b08bcab5bfe614e3a3f13ff0956c3c1fcd5733":{"cyrillic":false,"latin":true,"category":"sans"},"3ed818539386323b829090b6f47caddf291ef468":{"cyrillic":false,"latin":true,"category":"unknown"},"4828661777d9490eba77f07c62470da846f4a338":{"cyrillic":true,"latin":true,"category":"unknown"},"dd73b598b3eb7935e7050a6eacb9d78b12a0709f":{"cyrillic":true,"latin":true,"category":"unknown"},"d6f96cb91de5a836b60d42f6cd608db1fbd66af5":{"cyrillic":true,"latin":true,"category":"unknown"},"89c399e0456044e64e5a867952f6933a4403faec":{"cyrillic":false,"latin":true,"category":"unknown"},"127755187a27fe6470d81d07e85b3782d7e9d9d4":{"cyrillic":false,"latin":true,"category":"unknown"},"506be281bc85a66ac9554c492092a3e1c827236e":{"cyrillic":false,"latin":true,"category":"sans"},"1f9bee679aafb5833e73f2aa05be8b5161969d7b":{"cyrillic":false,"latin":true,"category":"sans"},"f848d05c16313aa0f10a14ea1dcb87ab89182e2e":{"cyrillic":false,"latin":true,"category":"unknown"},"0f5c3c700ab5a1d672a94cf7951e8e900f246d1b":{"cyrillic":false,"latin":true,"category":"unknown"},"82f13494df2d6a566c07aace3d96391ac8b67f03":{"cyrillic":true,"latin":true,"category":"unknown"},"8ccca76ab75588ca83fae979aa98b517810cd720":{"cyrillic":true,"latin":true,"category":"unknown"},"ac68cc8147e9f84a295cb8bc1444c8579470a1e9":{"cyrillic":true,"latin":true,"category":"unknown"},"9df030e1055428415350def5a3954e85a7893c8c":{"cyrillic":true,"latin":true,"category":"unknown"},"a155fcd41a2af644b2e558a81962aa7f38ed3a26":{"cyrillic":true,"latin":true,"category":"unknown"},"04231891f60529da8211f16e0a865a689a312f7e":{"cyrillic":true,"latin":true,"category":"unknown"},"78874c12877acf2ed3900ce82280a1a25fe706d3":{"cyrillic":true,"latin":true,"category":"unknown"},"8d3e08ad1e6907f77c5b6f93c5ef4dfbd206744f":{"cyrillic":true,"latin":true,"category":"unknown"},"af2669863e37a14237c1525bc4a46bece581815f":{"cyrillic":true,"latin":true,"category":"unknown"},"07cfcf76733f9f2a0ba7e65134bffc404d892ed3":{"cyrillic":true,"latin":true,"category":"unknown"},"0bd9449de3dd8639ffc92a909a14d7e1c4e7d57d":{"cyrillic":true,"latin":true,"category":"unknown"},"ddbf570e57274058abdcc931bad7ca15ec9cd25a":{"cyrillic":true,"latin":true,"category":"unknown"},"dc19c36de755a328db01299e6a6e1dd111f673c7":{"cyrillic":true,"latin":true,"category":"unknown"},"c79b28b05cac55ee331e9446f338ec93784a3eb6":{"cyrillic":true,"latin":true,"category":"unknown"},"8e6083bf9f829d082c95d5ced8ac4d1f2d5e59a9":{"cyrillic":true,"latin":true,"category":"unknown"},"3663f43c46d118f0e507446617677ec5c5d8ae0e":{"cyrillic":true,"latin":true,"category":"unknown"},"2d92ebe36899f7812519f2cbafdbedeefe60ce9d":{"cyrillic":true,"latin":true,"category":"unknown"},"d1a92fdcb88c5c97df0633d47f84f53c25fb6310":{"cyrillic":true,"latin":true,"category":"unknown"},"3343cdbcd3d87c75a1f9686b56397de193aa64b6":{"cyrillic":false,"latin":true,"category":"decorative"},"9c6eba0879179cd04ab3fe02b50c9306fe2b65ba":{"cyrillic":false,"latin":true,"category":"decorative"},"d76a1d4b2d8d97c320350c3c7978c2bd2a4372e6":{"cyrillic":true,"latin":true,"category":"unknown"},"77ee8ea161432070e69c16c52a4181b88f2bccdc":{"cyrillic":true,"latin":true,"category":"unknown"},"6cfebf4e9247729d68dce540333b545fa6c38d34":{"cyrillic":false,"latin":true,"category":"unknown"},"1d6d83007edf3ac0a101838a9c6571d1e97d6975":{"cyrillic":false,"latin":true,"category":"unknown"},"38f8aa7e5c897b790b31b909ace5a1a56ebdaeb0":{"cyrillic":false,"latin":true,"category":"unknown"},"a202be3f126b0b423202aecfa6d4ef162624837b":{"cyrillic":false,"latin":true,"category":"sans"},"d2a9f9e1b7afd624a41e12dbdff9cb4e43deca13":{"cyrillic":true,"latin":true,"category":"unknown"},"341db447fb54a43a5e082d836754ebcc1a94b712":{"cyrillic":false,"latin":false,"category":"unknown"},"3f58570fdcda6368f92887b70499eea5b37ebf2c":{"cyrillic":false,"latin":true,"category":"unknown"},"3a449d154ccfdf221ea1155ba8d7e858e5ad1865":{"cyrillic":true,"latin":true,"category":"sans"},"c3b733c0c54a1dce9703157a76b523192c6be751":{"cyrillic":false,"latin":true,"category":"unknown"},"f158d55f00bbf479a5f1e7c7f568913a8250a885":{"cyrillic":false,"latin":true,"category":"unknown"},"6c505bcc05b807151540c078befea5dc44236ecc":{"cyrillic":true,"latin":true,"category":"serif"},"039ce9e722fb5461980c0e96e6db545b7d74ecb7":{"cyrillic":true,"latin":true,"category":"serif"},"b1b76e52f11a02aac51538961227436a92d3f66e":{"cyrillic":true,"latin":true,"category":"serif"},"ebf1fe42e9ec3959c2e20a1dcbc5db2909df75cf":{"cyrillic":true,"latin":true,"category":"serif"},"1a28eeb17ad5652c28e7b73a9f524fabb9329ad8":{"cyrillic":true,"latin":true,"category":"unknown"},"fd1a31e7096c7a15679bb0ca8ec8b236ceefab8b":{"cyrillic":true,"latin":true,"category":"unknown"},"91f6473902c411eb1d4d507b35dfc9c6067375bc":{"cyrillic":true,"latin":true,"category":"unknown"},"7a3be08dd50ca56ffd003b59d00c1184c0b765bf":{"cyrillic":true,"latin":true,"category":"unknown"},"e1e914d90295609fc326390ec420e9b3354df1ad":{"cyrillic":false,"latin":true,"category":"decorative"},"d612217730d7c36f7adde8c492ca7fde202b4dcc":{"cyrillic":false,"latin":true,"category":"unknown"},"8847c1fc8011e15ac6fbe468b9eee3e0ec441b66":{"cyrillic":false,"latin":true,"category":"unknown"},"a413a600ede6cfc81fae3e310037dd30a5c93f5b":{"cyrillic":false,"latin":true,"category":"unknown"},"41709143ec7426755fb3c9288ad49332db291367":{"cyrillic":false,"latin":true,"category":"unknown"},"668f80d301c234a4edb4586b5edcb34c20880b66":{"cyrillic":false,"latin":true,"category":"unknown"},"052b9c2a2647417662b91c1e4561eb439ed3f0ee":{"cyrillic":false,"latin":true,"category":"unknown"},"2ed038e3756823d46ab16c9297935faa07ab2aad":{"cyrillic":true,"latin":true,"category":"sans"},"30fae7b924d987c425e41539d5f39c008feade61":{"cyrillic":false,"latin":false,"category":"unknown"},"58da6a6b28c7f6980fa69b5acd522050d935541e":{"cyrillic":false,"latin":true,"category":"sans"},"44d031f9bf4afbe39853d58b57c704a3b3e34c95":{"cyrillic":false,"latin":true,"category":"unknown"},"d8da5247a27b2606b07c8cbb00965325cd78f0eb":{"cyrillic":false,"latin":true,"category":"unknown"},"6a39833e2c2aa138cc67663eae25ac65557dba91":{"cyrillic":true,"latin":true,"category":"decorative"},"a93ab72ea86e7df34fb35881718dc8499a6bc52a":{"cyrillic":true,"latin":true,"category":"decorative"},"5ae8de4d790b72ce99ff95c7eb66bcde503f30f1":{"cyrillic":false,"latin":true,"category":"unknown"},"d4afa7ee21dfad8930a73000ada848ba99d8cf00":{"cyrillic":false,"latin":true,"category":"sans"},"4e41dbe8a7e7865d6c12c70bb0efc03e734975b2":{"cyrillic":true,"latin":true,"category":"unknown"},"b5cc9e5151a4119003fc085a7e956761290d2c5c":{"cyrillic":true,"latin":true,"category":"unknown"},"66ce23345d76fd1247f9a381085f8c5a3480b1ce":{"cyrillic":false,"latin":true,"category":"unknown"},"83f70b2b4bc5d07eed503fa0a67bc096e5afe3cb":{"cyrillic":true,"latin":true,"category":"unknown"},"c1fe9be8c4c0b0479f60c790dce60df81c8802ce":{"cyrillic":false,"latin":true,"category":"unknown"},"6940f3b82aa171efef7578101f8d7027567b226b":{"cyrillic":false,"latin":true,"category":"unknown"},"06584ac1f927b01cdd10c12c47e645608f7d3c25":{"cyrillic":false,"latin":true,"category":"unknown"},"002c8451c249afdcf27de7f8c3ef571d8a6af90c":{"cyrillic":false,"latin":true,"category":"unknown"},"3f6428ab7093e2247314843460b4006629186b4e":{"cyrillic":false,"latin":true,"category":"unknown"},"a16a78ca7acebff7f5002b7b5e9cba830a58c617":{"cyrillic":false,"latin":true,"category":"unknown"},"df989ab6bb1cc75a6131358df30993fc6f78cbe6":{"cyrillic":false,"latin":true,"category":"unknown"},"d9b234bedae5046ea3ee60806af8acb62fdde5bf":{"cyrillic":false,"latin":true,"category":"unknown"},"0b13b3825c6a92da75143c0a3ccc3ad3bfac837e":{"cyrillic":false,"latin":true,"category":"unknown"},"b43e0210f09e03d82a3161ec835b6b9a9f2d728d":{"cyrillic":false,"latin":true,"category":"unknown"},"a2c66aaf499a2c90961decd0bb66633c664e5c0f":{"cyrillic":false,"latin":true,"category":"unknown"},"73af72f7ad62cd6b8c7dd4088239d37be5c59df2":{"cyrillic":false,"latin":true,"category":"serif"},"49910cbf84a4481a96419f9d91370f8664abebc3":{"cyrillic":false,"latin":true,"category":"unknown"},"0c51b082ee1d1108e148ba85fdaa04959b1a9cce":{"cyrillic":false,"latin":true,"category":"unknown"},"cf2ef432aec5b56010ac57893576b0a54b1baea0":{"cyrillic":false,"latin":true,"category":"unknown"},"6be2b806659a750517fa1b19e4a91a8362d4f7ec":{"cyrillic":false,"latin":false,"category":"unknown"},"b0c7b97ac747a61bcd447631ec78d190d4b0508b":{"cyrillic":false,"latin":false,"category":"unknown"},"88e35f68c69781212b9a697f0c4b78450cde99d9":{"cyrillic":true,"latin":true,"category":"unknown"},"d941d5a9fe7fba5ccc4f19060a7ca8f507b2080a":{"cyrillic":true,"latin":true,"category":"unknown"},"aec01c5e75b0ccadd218541cc7c9a267cb9e6723":{"cyrillic":false,"latin":true,"category":"unknown"},"d6dd8eaba5662394b6a9ec7e8faf5d42a148d5dd":{"cyrillic":false,"latin":true,"category":"unknown"},"7754b5501be96f703d0e207c60a2dc1db734f958":{"cyrillic":false,"latin":true,"category":"unknown"},"b6a92845a87fd807447410c7a4f35f9c59e595d1":{"cyrillic":false,"latin":true,"category":"unknown"},"81ce12f7cf4c414d3223ca989b7568b55da7821a":{"cyrillic":false,"latin":true,"category":"unknown"},"f498df7f683dae5ccab65b5c033723ef6b0a25bc":{"cyrillic":false,"latin":true,"category":"unknown"},"0e8297d362ef9aef2bde90a1c673d21e8c94f0da":{"cyrillic":false,"latin":true,"category":"unknown"},"4894834222edd46f9ff1b83b4c916022460ba38f":{"cyrillic":false,"latin":true,"category":"unknown"},"fc490af0a02a63f8b3b41673d454d055564b370c":{"cyrillic":false,"latin":true,"category":"unknown"},"719cdb41d7242f27875c30ea326d150093c386ac":{"cyrillic":false,"latin":true,"category":"unknown"},"b0cdf030742cf2572c596be1892954be6624709e":{"cyrillic":false,"latin":true,"category":"unknown"},"b30f91b1a8034ae5cf474f6cff384c49b430e424":{"cyrillic":false,"latin":true,"category":"unknown"},"ff39ea41dfac63e92c5a3c669597843c5c0ea37f":{"cyrillic":false,"latin":true,"category":"unknown"},"c137624939ccc991c6e27d48fdaca48296f214f4":{"cyrillic":false,"latin":true,"category":"unknown"},"73b54c878ac2b7da7c3518bcda9909f165b4f0ef":{"cyrillic":false,"latin":true,"category":"unknown"},"4dd652ff20cffa744d70d4738e8b7b7dad4cb860":{"cyrillic":false,"latin":true,"category":"unknown"},"18d142ba64357f95ed51aa60f4610866b4285ccf":{"cyrillic":false,"latin":true,"category":"unknown"},"b03750d2c00a29121bc2e1645378586df22ba636":{"cyrillic":false,"latin":true,"category":"unknown"},"46c749aaa4091e959abca2e2318865f05f83f0a0":{"cyrillic":false,"latin":true,"category":"serif"},"bc4f075a218d404cbb34beee3e6547e745dc135c":{"cyrillic":true,"latin":true,"category":"unknown"},"5f3f098a063c62557c6eb3d62515e3a33e2aa6a3":{"cyrillic":true,"latin":false,"category":"decorative"},"9b8f9195d30eb9abe19433c35dcb831bee5d4121":{"cyrillic":false,"latin":true,"category":"unknown"},"9c0e97e30f427f4802a2cca137c1b03acec6685c":{"cyrillic":false,"latin":true,"category":"handwriting"},"0600c926fdba724c9f7a2b5a104bd1d36dcaab94":{"cyrillic":true,"latin":true,"category":"unknown"},"bb68d95da98eb9e3f8af9d2c1f6a0116d7253db3":{"cyrillic":true,"latin":true,"category":"unknown"},"e6228ed82cf30f89bc6109447a1df54dcc47290d":{"cyrillic":true,"latin":true,"category":"serif"},"d2ae7cedfde1e92c0dfa4fef72499308f69479b2":{"cyrillic":false,"latin":true,"category":"serif"},"97ef73c6bf35fe9bf1b522cda9d02696f87f4f29":{"cyrillic":false,"latin":true,"category":"symbol"},"db811c8873c7ec992ac52fccb97783f229ef851a":{"cyrillic":false,"latin":true,"category":"symbol"},"0ff69f050fe1361057c1f19b8fc7b79e0109decc":{"cyrillic":false,"latin":true,"category":"unknown"},"89b8318bb779e5a6a1b601422e9723c4e62f8e0a":{"cyrillic":true,"latin":true,"category":"sans"},"9e9c626890ac1e12adccf02f5a2af62d1f51b273":{"cyrillic":true,"latin":true,"category":"sans"},"0f53dfe4a5b4b50b569bdbedf0834ee7b29bcbbb":{"cyrillic":true,"latin":true,"category":"sans"},"1f64bedef3b7648816870c4fe355fcf446363578":{"cyrillic":true,"latin":true,"category":"sans"},"f333e0eaa266d6f1dd7eec46e730bb0f76b51d0b":{"cyrillic":true,"latin":true,"category":"sans"},"5a6e342f0c24195541a63b3ff1b4ff12d4dd680f":{"cyrillic":true,"latin":true,"category":"sans"},"933d71747cbf56489c59a5d23ab43c9cf546dd9f":{"cyrillic":true,"latin":true,"category":"sans"},"4e40f672c8f7b987e8e92859b78eb39fffca5cb4":{"cyrillic":true,"latin":true,"category":"sans"},"5b8050dca05eff37948326f3270aadfe6156e524":{"cyrillic":true,"latin":true,"category":"sans"},"80f57b9f49a629e88deddc8ee5ea9094adc330f5":{"cyrillic":true,"latin":true,"category":"sans"},"ed78bd41630a28d6cfcfcb52d60b12e9ad0137ba":{"cyrillic":true,"latin":true,"category":"sans"},"f89ea440c53bd9a19d10a33cbd2d75499eb35221":{"cyrillic":false,"latin":true,"category":"sans"},"a885aafb35ec661230ddff5d6ef349ffd2594879":{"cyrillic":true,"latin":true,"category":"sans"},"1ebc68ea6a34c0ded4b07a79637ddd6a1297cef1":{"cyrillic":false,"latin":true,"category":"unknown"},"6e6a08acc88e6d0c70651d70ea36cea26a6c19cd":{"cyrillic":false,"latin":true,"category":"handwriting"},"3095e8dbcd12f9da9b3d868e62f3f00ee100899a":{"cyrillic":false,"latin":true,"category":"handwriting"},"c55289ae6746e10ca952119ab60e5610c10c49bc":{"cyrillic":true,"latin":true,"category":"serif"},"969bd6cb63f8b4913a99927f6f67bb054d510d47":{"cyrillic":true,"latin":true,"category":"decorative"},"fa99da80abc56e77145f26ebaf12fee904cd13e8":{"cyrillic":true,"latin":false,"category":"unknown"},"9a8489af896172a93316f19ce857346397ee537a":{"cyrillic":false,"latin":true,"category":"unknown"},"b3dde7e58b98e5614812713274d4c49d7d2c4b89":{"cyrillic":false,"latin":true,"category":"sans"},"2fd575bb8a2e5a89c2f17cdfee4fdacae45c7aa7":{"cyrillic":false,"latin":true,"category":"unknown"},"d3578c695c36a366d3b09af3562afa3d3c670a7e":{"cyrillic":false,"latin":true,"category":"unknown"},"f5808da76afcd8c0e6260887da708a0c23eb8b4a":{"cyrillic":false,"latin":true,"category":"handwriting"},"75723f590f99a2d434bdb3a40f35fafbf2dfff40":{"cyrillic":true,"latin":true,"category":"unknown"},"880a1c7eebb98f2cede74e914a34916e987ef7d9":{"cyrillic":true,"latin":true,"category":"unknown"},"e372bab158ee88775c4ebfec2f67cedf55c8e3d5":{"cyrillic":false,"latin":true,"category":"serif"},"7a1d0e866be87b7aa5256ab7438c92c1ccb30273":{"cyrillic":false,"latin":true,"category":"serif"},"26c4169032cb6b2a1038764ed9d7bd2e04610254":{"cyrillic":false,"latin":true,"category":"sans"},"0bd5c43fc7ea0df986130ab1c0b5549cb46c25cf":{"cyrillic":false,"latin":true,"category":"unknown"},"09c6dcf1507fb610d28e94d21fc0275f32a31e1b":{"cyrillic":false,"latin":true,"category":"sans"},"9f046b53d0b8e8705897fd67135426d6beaba8ca":{"cyrillic":false,"latin":true,"category":"sans"},"38931b3fb0939d67a3193774f906466d95ef6f68":{"cyrillic":false,"latin":true,"category":"sans"},"7ce8a68f2883619d9db8352cecda1057e09aad9e":{"cyrillic":false,"latin":true,"category":"sans"},"f5112c51fe8b13f760262c00fce92e358d3c23e9":{"cyrillic":false,"latin":true,"category":"sans"},"fbd3fe41d816a5c39e1ba741967c01dc15550c9b":{"cyrillic":false,"latin":true,"category":"sans"},"378132b8e4be33667164566a0651d97d47a267ba":{"cyrillic":false,"latin":true,"category":"sans"},"33ba59d55c7845be796ec10fc93fd64ac6f31164":{"cyrillic":false,"latin":true,"category":"unknown"},"a660c90189a23cdda327f9e5ec83e63e8c5326ff":{"cyrillic":false,"latin":true,"category":"unknown"},"d42c3b143fa7f31d61af17998b58fb4dd0e76dbd":{"cyrillic":true,"latin":true,"category":"unknown"},"59d03de3460d34583bdafe195b1b80669180a611":{"cyrillic":false,"latin":true,"category":"unknown"},"e8bc3d80a917db584f206eecd670873c8668d3fb":{"cyrillic":false,"latin":true,"category":"unknown"},"a200c8732824842b756f52c98bc27eed50174c64":{"cyrillic":false,"latin":true,"category":"sans"},"f47b5a56831012b9d21899725b2c6ccdd85991d9":{"cyrillic":false,"latin":true,"category":"unknown"},"8507c5dd6e4983bd9fccf0f96ff999c8833bc8a8":{"cyrillic":false,"latin":true,"category":"unknown"},"b016f484d35b4eb909b28c5386939f8f0dece70c":{"cyrillic":true,"latin":true,"category":"unknown"},"2be69c947145eab1b3c0c979d2266649afe76d85":{"cyrillic":true,"latin":true,"category":"decorative"},"d7f82831a7aa2f6ba741c3446e2db96c040637d9":{"cyrillic":true,"latin":true,"category":"decorative"},"879b55fceec0b741473657e03eef169fbbb75533":{"cyrillic":false,"latin":true,"category":"sans"},"90a584f4f829015410952f4b03f3effb91ddaf5c":{"cyrillic":false,"latin":true,"category":"sans"},"4d63926b827a6f188652c54913bb1374d61e2fff":{"cyrillic":false,"latin":true,"category":"sans"},"45284d69990846675651a852707bbed6ee567962":{"cyrillic":false,"latin":true,"category":"sans"},"4ee9ab4f82232f29973d16ee6d624eef8d8d73e2":{"cyrillic":true,"latin":true,"category":"unknown"},"05e41b286272cb9b6febb842c90db07de4cdf367":{"cyrillic":false,"latin":true,"category":"unknown"},"bafeb5054ca1e10287478ec3f671b08dec150a04":{"cyrillic":true,"latin":true,"category":"sans"},"1c740e4f508a9095120427ee4c582782175ce5f0":{"cyrillic":true,"latin":true,"category":"sans"},"ae4c35ee634d3bf9ddfc45e65edb45def67c0060":{"cyrillic":true,"latin":true,"category":"sans"},"622e06fbcc7b7482c56a2e5773b9c14556f8ef42":{"cyrillic":true,"latin":true,"category":"sans"},"668752b1960c262fac9f0d1936ffa6719645019f":{"cyrillic":true,"latin":true,"category":"unknown"},"717611460426e28a1a94f5798ee4d76d66e82584":{"cyrillic":true,"latin":true,"category":"serif"},"07e3604574ec5290399eae4c42585531f7f81817":{"cyrillic":true,"latin":true,"category":"serif"},"af62413e6b1ea4db83c7509883075004af30c405":{"cyrillic":true,"latin":true,"category":"serif"},"e549070a1491b02bbea2b8422fefa431e41d9842":{"cyrillic":true,"latin":true,"category":"unknown"},"f1be90334ec515cabd381bf4a9b379f0b0dbb80a":{"cyrillic":false,"latin":true,"category":"unknown"},"6279dfe23bd1407f368772ab4522381ebef29b15":{"cyrillic":false,"latin":true,"category":"unknown"},"6724e9952e988d0b728e1b52905c5ce57b2182bd":{"cyrillic":false,"latin":true,"category":"unknown"},"2a7c681df8e25ed58ee4b4a16e6b9a58268c241a":{"cyrillic":false,"latin":true,"category":"unknown"},"73901a0f377bd1ad9f750b02c341cb60dac3f666":{"cyrillic":false,"latin":true,"category":"unknown"},"3d15f21b6b6f30278537d72e1c61aae51611dd3e":{"cyrillic":false,"latin":true,"category":"unknown"},"1fa01ba881babeb51f767390254a959e0842f7d0":{"cyrillic":false,"latin":true,"category":"unknown"},"ffaef9b11a802c29a478f04bf2c2126b9053109a":{"cyrillic":false,"latin":true,"category":"unknown"},"0eda5f113e8a549e142e1de9d2e054878ff45abe":{"cyrillic":true,"latin":true,"category":"unknown"},"c125b165c8272267ea2966c6726912953c8eacc3":{"cyrillic":true,"latin":true,"category":"unknown"},"62058d2a62fb6cfb9fad3aa4353553253eca4cca":{"cyrillic":false,"latin":true,"category":"unknown"},"7e495bd50e1c1105539fb706c50144ad5cc498c2":{"cyrillic":false,"latin":true,"category":"sans"},"83ba0c2332d4fffec69766a6ec426e5021d31227":{"cyrillic":false,"latin":true,"category":"sans"},"ca74e861d7f984f9f5c886065b464d50d348b739":{"cyrillic":false,"latin":true,"category":"unknown"},"8bc7a770dc060a296ed4f66a63fa36d85e6dfb34":{"cyrillic":false,"latin":true,"category":"unknown"},"7d21dbbb24c39681c1004facdd373555179483e7":{"cyrillic":true,"latin":true,"category":"sans"},"fcf5ef40732c44850167c3560981b8a8aae6507a":{"cyrillic":false,"latin":true,"category":"unknown"},"c221d6cf2e355284ed67a0a5e035c14a5f98d2a7":{"cyrillic":false,"latin":true,"category":"unknown"},"3c065fa2223b67e76fccb83efb4d020b0fdb20d6":{"cyrillic":false,"latin":true,"category":"unknown"},"fbb45da17d0dfdeb7c91e02e18d2710b293b2543":{"cyrillic":false,"latin":true,"category":"unknown"},"7c36f76a4d9f342f80b4648b3d881899e99318ed":{"cyrillic":false,"latin":true,"category":"unknown"},"c2b071b8753466653a3030cbab6c4022a16cf862":{"cyrillic":false,"latin":true,"category":"unknown"},"568ba996549ec711951e830f7c406b3cbbbfabf8":{"cyrillic":false,"latin":true,"category":"unknown"},"c73a6f0ca63c9c78f34d32431957f30ff13c432f":{"cyrillic":false,"latin":true,"category":"unknown"},"faf401b188564ca6fb8f4c6cf06d48833f4c567a":{"cyrillic":false,"latin":false,"category":"unknown"},"5a213446c587dd49d8dae917ed15a45439382998":{"cyrillic":false,"latin":true,"category":"unknown"},"cbe1a9a6d4aa3efdd09a1667f98c2bd20a99ac85":{"cyrillic":true,"latin":true,"category":"unknown"},"1ee17cf294f80022813cac25384f368b7db351e0":{"cyrillic":true,"latin":true,"category":"unknown"},"87796a132fba4417fc4926aae2f49e8e6b5874fa":{"cyrillic":true,"latin":true,"category":"unknown"},"1c86248a2b3c7a418493410c0e2211ff7b8d8439":{"cyrillic":true,"latin":true,"category":"unknown"},"b42a247a9e541593e075b488a7f5b105e8392e53":{"cyrillic":true,"latin":true,"category":"unknown"},"ab0ea5d85266799967c697f2024aa26d8a49df4d":{"cyrillic":true,"latin":true,"category":"unknown"},"e3f17e743eab09a9d5a71f2df2ccbc07226a3e05":{"cyrillic":true,"latin":true,"category":"unknown"},"2846b2ec5fb574b7bda093c1d1dd2167048e826b":{"cyrillic":true,"latin":true,"category":"unknown"},"b256d9e19ed63a820930d6991c10923cd9f90835":{"cyrillic":true,"latin":true,"category":"unknown"},"5b5af413ccfc28e736d3f5961028a992e5a4141d":{"cyrillic":true,"latin":true,"category":"unknown"},"7d8ad6771d8be0ff40d6022efbcdaf21394737a9":{"cyrillic":true,"latin":true,"category":"unknown"},"be670b306cd9d7c18044cac5a41dce63b01d0f08":{"cyrillic":true,"latin":true,"category":"unknown"},"0add141a18cae85645281ccf3072946affdebc7e":{"cyrillic":true,"latin":true,"category":"unknown"},"2160670f2fa7a4901cad189da480f26bcfbcc020":{"cyrillic":true,"latin":true,"category":"unknown"},"6703f2823b6a622c17259bcdb45e11037cdf717b":{"cyrillic":true,"latin":true,"category":"unknown"},"9615a0f5e15662ba8d2d5d72cadf8b00e0e2a517":{"cyrillic":true,"latin":true,"category":"unknown"},"02845d440aedf3a2e5becf5aa05602081074976a":{"cyrillic":true,"latin":true,"category":"unknown"},"0d3c3ea87649f54e031f2154d6521f82f8c130e4":{"cyrillic":true,"latin":true,"category":"unknown"},"0decab6116bda37d061a9f6fcf31247800019ec4":{"cyrillic":true,"latin":true,"category":"unknown"},"5401b2be8b9b66225b5dd5d94fba4d6b4b8c3f2c":{"cyrillic":true,"latin":true,"category":"unknown"},"c83b639f981013e286a18c3f0b297a527fd5f351":{"cyrillic":true,"latin":true,"category":"unknown"},"2162ff81bf50b5a7f392f9092dbe6824760b174b":{"cyrillic":true,"latin":true,"category":"unknown"},"bfa457ca799c5502ab4bafe672a36eb1f60c4abc":{"cyrillic":true,"latin":true,"category":"unknown"},"8c340edd4474fdb672af28620995b6920e4ae770":{"cyrillic":true,"latin":true,"category":"unknown"},"5408faba9761f0ecbe8bc6eb5e47d14ecddd8ecd":{"cyrillic":true,"latin":true,"category":"unknown"},"b42f88aff12dffa3274cc5c0f6bd95c9d1012190":{"cyrillic":true,"latin":true,"category":"unknown"},"4207ce45664f6f76f1842c8de71694ae87c10a26":{"cyrillic":true,"latin":true,"category":"unknown"},"ebfc9e3a91dca2637ce9cffa14b71f88c1f2a0f1":{"cyrillic":false,"latin":true,"category":"sans"},"765e82f8f59fa831225fc4a04d0629393b377651":{"cyrillic":false,"latin":true,"category":"sans"},"2bd6898be8a5610366aed071a56da59662c64e80":{"cyrillic":false,"latin":true,"category":"sans"},"103578304076f4e4806113cd442dbaacaf026184":{"cyrillic":false,"latin":true,"category":"sans"},"100a108ecde34747a4ce8c16fa6039471c585ab0":{"cyrillic":true,"latin":true,"category":"sans"},"5c1f8b816d97d2f1485cf2f89e26e9b39340a21f":{"cyrillic":true,"latin":true,"category":"sans"},"d6bbe1fc20ef3c0301fa8f2a8d5f80c6c0f7df9c":{"cyrillic":true,"latin":true,"category":"sans"},"5abd8151e3edb4d3f521bb2ceab5b7a7e1869184":{"cyrillic":true,"latin":true,"category":"sans"},"ce7c16bed02fa9433e07a2ea4a1fbc782a16dc7e":{"cyrillic":true,"latin":true,"category":"sans"},"8d417a82cc34acc73eb59f4eedbd8e5148426394":{"cyrillic":true,"latin":true,"category":"sans"},"ebf5a8d2e44297bfc0f8c07cdc0e0938ee914c0e":{"cyrillic":true,"latin":true,"category":"sans"},"4fc524c98fb3c9bc93bae37b3400a2fb67baba0c":{"cyrillic":true,"latin":true,"category":"sans"},"e2f33e2241214dc4d111e38ccb58255f66065ca4":{"cyrillic":true,"latin":true,"category":"sans"},"e422ec1ac751e05a78538f51e8b8430425454a1c":{"cyrillic":true,"latin":true,"category":"sans"},"ca5617a8d2d470910fdc04ff06fdb1db6fac0229":{"cyrillic":true,"latin":true,"category":"sans"},"30b4ec6c90e97ca98549fbfff1fc51deb43ee3b9":{"cyrillic":true,"latin":true,"category":"sans"},"f742fa638585c979e866943eded2046846bbf399":{"cyrillic":true,"latin":true,"category":"sans"},"397c273cba411963b4207c3149cef11de48a9efa":{"cyrillic":true,"latin":true,"category":"sans"},"4abbc8e9c1913de1be743942f70c784b03a87e21":{"cyrillic":true,"latin":true,"category":"sans"},"ec780f5fc9a42381bdd90935baab351fccceb981":{"cyrillic":true,"latin":true,"category":"serif"},"79e1e339b2a5cb64fa76d0a9d072014ff54018db":{"cyrillic":true,"latin":true,"category":"serif"},"733df6271d6f5d39028a0980743c74e55a9249ec":{"cyrillic":true,"latin":true,"category":"serif"},"779eecec17c20996bd047a3e7ace218717227873":{"cyrillic":true,"latin":true,"category":"serif"},"77f930594ad1901b0c15b2fd45710d2af1eb3c63":{"cyrillic":true,"latin":true,"category":"serif"},"7734162a38609ceb213f7bf8915c138f03167fea":{"cyrillic":true,"latin":true,"category":"serif"},"0818c9a32b9116ddbf953576879f1c6a70673d71":{"cyrillic":true,"latin":true,"category":"serif"},"026fb2ea3a3315f3336065d4fe2eac3ce8b15163":{"cyrillic":true,"latin":true,"category":"serif"},"03370980a29fb8a600efe73d3b4b98f6cc4b7a30":{"cyrillic":false,"latin":true,"category":"serif"},"43d4b1291d65c0b3bb6bc728f7ca4c869d87554b":{"cyrillic":false,"latin":true,"category":"serif"},"97f323ef25bd126a5ca0d128fb751c394cc0e7c1":{"cyrillic":false,"latin":true,"category":"serif"},"9baefae5e6c8b4085831d91ca64c1b2040e80531":{"cyrillic":false,"latin":true,"category":"serif"},"da65e1044bac137a2570bac9f92a1077cd7acb10":{"cyrillic":false,"latin":true,"category":"serif"},"b0e574fd0124016d6063a1851b7b70c29aee9e5e":{"cyrillic":false,"latin":true,"category":"serif"},"2e3e36d774961f8b073d3cad3bc7800c321089f0":{"cyrillic":true,"latin":true,"category":"sans"},"2364f8e4cdc4b833f6b381b9e9c0522f3a3b5f8e":{"cyrillic":true,"latin":true,"category":"sans"},"56bad12e6682f917c208bc25affbb726f0f6a348":{"cyrillic":false,"latin":true,"category":"unknown"},"85cc5f4484e76f4aa5aa61884dd1c3ac01fcf61c":{"cyrillic":false,"latin":true,"category":"unknown"},"abe71aaca33940ef2d0f23b1b2adc79435a8f7cf":{"cyrillic":false,"latin":true,"category":"unknown"},"da72d57d32069d0e144ce210b0256787a98dfce0":{"cyrillic":false,"latin":true,"category":"handwriting"},"81ec7088ebdafe3106997136e55e93b8fa4f41be":{"cyrillic":true,"latin":true,"category":"unknown"},"b9be144475797b2d814b0525cf335d4df3c31f94":{"cyrillic":false,"latin":true,"category":"handwriting"},"84925296a3d8502bf2f78a3f2dfcf524109694db":{"cyrillic":false,"latin":true,"category":"sans"},"76019d3d837ba51a29ca290e596ad7734ab7e621":{"cyrillic":false,"latin":true,"category":"sans"},"addceb10cce97fa679e230dd3b7221344145e725":{"cyrillic":false,"latin":true,"category":"sans"},"f8f19dd4914dffa2bf6f73138a89627799ee815b":{"cyrillic":false,"latin":true,"category":"sans"},"5519932188dd8482c23bc26e41252b0f99863f79":{"cyrillic":true,"latin":true,"category":"decorative"},"0e2c4b47f8b2e1a28a3900b1c062fb34aa291de1":{"cyrillic":false,"latin":true,"category":"sans"},"7315dfc02c6d140efba00bd3174b009dacf06691":{"cyrillic":false,"latin":true,"category":"unknown"},"ecd23c47ac511397d2718e650897bb722084941f":{"cyrillic":false,"latin":true,"category":"sans"},"a0f4a030703ba123a0a6cda421c382729e9aec90":{"cyrillic":false,"latin":true,"category":"unknown"},"fe75fe1d24eab45c20bb192df65c18d5545f0665":{"cyrillic":true,"latin":true,"category":"unknown"},"98e70c88b0eba378c60d390f0a4075ee4e3836ac":{"cyrillic":true,"latin":true,"category":"unknown"},"537ad48c4b22d3575f3f78356a1cca4dca7fe379":{"cyrillic":true,"latin":true,"category":"unknown"},"e6451ed1447fcc4a80424a5e32e0bc49561b4635":{"cyrillic":true,"latin":true,"category":"unknown"},"d1e4e0985bb839927178bd528bd9ec116f8feb54":{"cyrillic":true,"latin":true,"category":"unknown"},"0a8b3d92c88242c058feacaf4af597fef9a45828":{"cyrillic":true,"latin":true,"category":"unknown"},"64748b0ea05c6b728ac3b7e893a2209dee9162f6":{"cyrillic":true,"latin":true,"category":"unknown"},"bfc48f8f1aed5b9994a73b3d8c034d91b0720110":{"cyrillic":true,"latin":true,"category":"unknown"},"51535f8fd0df7b865e51006bb1ec5b3dc43990b0":{"cyrillic":true,"latin":true,"category":"unknown"},"7e4eeeef975f17625400a64daa3ab7a73fe2f52d":{"cyrillic":true,"latin":true,"category":"unknown"},"3f2b7d0b087d3dea3c431c64375752ec77c9a3e9":{"cyrillic":true,"latin":true,"category":"unknown"},"6168bd9f1070a375f4f43806ca4d3a789b573e00":{"cyrillic":true,"latin":true,"category":"unknown"},"7c177e592946ec1ff57aa75319fd8dedc00738af":{"cyrillic":true,"latin":true,"category":"unknown"},"b8bc2e213402d60179c65b39714c53b807eb67e4":{"cyrillic":true,"latin":true,"category":"unknown"},"3f2760684f0e46470057104a187fc8db032e4ef2":{"cyrillic":true,"latin":true,"category":"unknown"},"72a7adfcb4241a3cbaa4b192fac313d518ee3bc0":{"cyrillic":true,"latin":true,"category":"unknown"},"73e0d0a6a563308735b3aacb7b333b76257ef050":{"cyrillic":true,"latin":true,"category":"unknown"},"49ab9a83b913eb46949713e023b1b9e26c38340b":{"cyrillic":true,"latin":true,"category":"unknown"},"2ea2194c2cbdcd65ce535b531f710f5e8ff77e8d":{"cyrillic":true,"latin":true,"category":"unknown"},"994330bf2c0adbaa0e222339949f0250a7385e73":{"cyrillic":true,"latin":true,"category":"unknown"},"ec6d424e1ce46ea8070f11987b02e6be6e46e7c0":{"cyrillic":false,"latin":true,"category":"sans"},"f85211341fd366d92c69a0e78bf7f6c4588e0bac":{"cyrillic":true,"latin":true,"category":"unknown"},"a1608d91235e9e3b52e40a729387e5fa91434b26":{"cyrillic":false,"latin":true,"category":"sans"},"e6bd77eefc51fb6d3d5359ea55e36e812ca63f90":{"cyrillic":false,"latin":true,"category":"sans"},"5954f1c663e8411b98a646e3b84d6ed30ad586fb":{"cyrillic":false,"latin":true,"category":"serif"},"3a70e320ea6815e09a8ff49f5c55ed84f0c6e975":{"cyrillic":true,"latin":true,"category":"unknown"},"e09d6fed5066f14cc4df2e03e2f02b6d05c11f6d":{"cyrillic":true,"latin":true,"category":"unknown"},"e6a56a4185a7b6e9d3f8ee0b371ff36b4a44d71d":{"cyrillic":true,"latin":true,"category":"unknown"},"ded702ed3b0878c807bbb5d9f038a3698ebb1123":{"cyrillic":true,"latin":false,"category":"sans"},"19c213ee9eb3c24a09ef2bad3663a04e730bee37":{"cyrillic":true,"latin":true,"category":"handwriting"},"db2dafb63a0ff170d040cd70a2cf1c49140acd55":{"cyrillic":false,"latin":true,"category":"unknown"},"a0d2ac8cce32d7c03f84352f1fdf3f35f82db0fa":{"cyrillic":false,"latin":true,"category":"unknown"},"4a725b9ab944adceb41614c934677c6997266581":{"cyrillic":false,"latin":true,"category":"sans"},"d57fc0624e7a052babb427b9c5f888e77cd30e7a":{"cyrillic":false,"latin":true,"category":"unknown"},"08e3e25f7aeaa3b3db32c3eedb22d155c1218ab1":{"cyrillic":true,"latin":true,"category":"unknown"},"bbd831af29c8adc68d87f2f11c23586eaf42e9d7":{"cyrillic":true,"latin":true,"category":"unknown"},"7a8753386c9fe2093af3fee96554275600221ce7":{"cyrillic":true,"latin":true,"category":"unknown"},"2a577e4119d689428722b7b46043fc6cbd83cd6e":{"cyrillic":false,"latin":true,"category":"sans"},"5d6d686df96bcbb623040ca2664857d9ad06b94b":{"cyrillic":true,"latin":true,"category":"serif"},"452c2eac5604fd32d2f2a206765c615f536649dc":{"cyrillic":true,"latin":true,"category":"serif"},"ada852627987323ea3dcd437edf6512e868ace37":{"cyrillic":true,"latin":true,"category":"unknown"},"d3d6bf8ff0a97035a023d2e9bab7c1040abfe6c3":{"cyrillic":false,"latin":true,"category":"decorative"},"1d8ee1bec2a9640dfd4f66f1047de2ef3f869aa5":{"cyrillic":true,"latin":true,"category":"sans"},"7788943cf96b0d8049532ab3d2420bef25f2178b":{"cyrillic":true,"latin":true,"category":"sans"},"6ba151fc5ccb09171143906efa08fa34f9071606":{"cyrillic":false,"latin":true,"category":"sans"},"b988a70f5f69e356289233bb9240f77800347213":{"cyrillic":false,"latin":true,"category":"serif"},"a731b9e847a5d545eed4db3075c5ade5178555a0":{"cyrillic":false,"latin":true,"category":"serif"},"015111a8c5061e1ce7bbbce7926345dc666d3306":{"cyrillic":false,"latin":true,"category":"serif"},"dc854590878ea64a83cfd8ad1ca6c6f02855e9ff":{"cyrillic":false,"latin":true,"category":"serif"},"1a1b0a34f60e61732ca05d7488b3c4f1fc493f16":{"cyrillic":false,"latin":true,"category":"serif"},"4d053f7fc78c0220968a391526e4917486704ff1":{"cyrillic":true,"latin":true,"category":"unknown"},"81bbcb08462ed39d4758b3c861071e078fae0690":{"cyrillic":true,"latin":true,"category":"unknown"},"97268f49841106ebf80fde22765e790040ee7ae0":{"cyrillic":true,"latin":true,"category":"unknown"},"0cd3e746858c8210bd57d3342ce83edc3e4684fc":{"cyrillic":false,"latin":true,"category":"sans"},"7f5938fca9cd71c3b994e9f3de97009ae3f07208":{"cyrillic":true,"latin":true,"category":"decorative"},"7a8860d36395abe874393db0509eb5db5a877940":{"cyrillic":true,"latin":true,"category":"decorative"},"5a455f9e952302ecfcc5ef809a4673051eb6c4dd":{"cyrillic":false,"latin":true,"category":"unknown"},"837ecb3986cf8beb3272c74167ea303947c39be0":{"cyrillic":true,"latin":true,"category":"unknown"},"becfd14b3005cef6e466dc1b525c4fa81b2c7a42":{"cyrillic":true,"latin":true,"category":"unknown"},"bad0498d197219d32e6ff831bd87c2a3b32b675a":{"cyrillic":true,"latin":true,"category":"unknown"},"d3cafd065d69120405e9564259d1e7101861c45d":{"cyrillic":true,"latin":true,"category":"unknown"},"4bfc4c409e9df92fa6f941df2603170153bc898c":{"cyrillic":true,"latin":true,"category":"unknown"},"41fbf1a1d11323b49bd433ed5fe08a5d4d50b224":{"cyrillic":true,"latin":true,"category":"unknown"},"e1fbc87ed2cf1abeb41116169ec8d4385ed65912":{"cyrillic":true,"latin":true,"category":"unknown"},"bc47694d278805b4c421883c82a7e43bdc1a9c42":{"cyrillic":true,"latin":true,"category":"unknown"},"b30e0034bd91dc02af0ce60d76a5815c50a62de8":{"cyrillic":false,"latin":true,"category":"unknown"},"9fb02b72a8f0a86075df61431b0d751a25fefd5f":{"cyrillic":true,"latin":true,"category":"unknown"},"da4e0afeb21eb2aca84001467e4d846c4b95b326":{"cyrillic":true,"latin":true,"category":"unknown"},"df5c91efe039eee3252dc9e659696fc267ef0052":{"cyrillic":true,"latin":true,"category":"unknown"},"8c2af1ac22aca0e414e6b01f5e00513804beda75":{"cyrillic":true,"latin":true,"category":"unknown"},"2623680b53fedcf9e073de0c70a45663ae7094c5":{"cyrillic":true,"latin":true,"category":"unknown"},"e8f76ab45e2599ba5520308aada0c748fbe9a982":{"cyrillic":true,"latin":true,"category":"unknown"},"5be61cf6fdedecbd7d19210c8768e8c19e0889c3":{"cyrillic":true,"latin":true,"category":"unknown"},"9cf2e4141be9fcd7acbeddd142b8bef620d94708":{"cyrillic":true,"latin":true,"category":"unknown"},"c4ce45b689cd32f5e352006abfb7af1a23a2d5f8":{"cyrillic":true,"latin":true,"category":"unknown"},"2b3ab187a92e9980d4e8a912ad7063274bba75ac":{"cyrillic":true,"latin":true,"category":"unknown"},"f7c018bce69466f31d942f8c8067b7df665e540e":{"cyrillic":true,"latin":true,"category":"unknown"},"a80b1b5337a0eb0bce305eb10fef21db858cc73a":{"cyrillic":true,"latin":true,"category":"unknown"},"b9a36cea6dd36fa1edab9e7aa896ffca08861ed3":{"cyrillic":true,"latin":true,"category":"unknown"},"4feeb933944c656f7927163e68aa4b6eb54584ad":{"cyrillic":true,"latin":true,"category":"unknown"},"d186f6be7cff60530453bf14daefb32ce18d4f03":{"cyrillic":true,"latin":true,"category":"unknown"},"3c0aca7a5a760aa94cfcb04c2d3fba2755a2332c":{"cyrillic":true,"latin":true,"category":"unknown"},"5d8e120f4b9450c639625c889e4325a6ca3dd8e7":{"cyrillic":true,"latin":true,"category":"serif"},"814ff65855a386bfa780c5d52773f8db2957b69c":{"cyrillic":true,"latin":true,"category":"unknown"},"6ae59805ddc0b5cf900b1a7c39b45c18d36813eb":{"cyrillic":true,"latin":true,"category":"serif"},"e4d0cfb7381b98f5be561ef710512fb34bc2b656":{"cyrillic":true,"latin":true,"category":"unknown"},"076a7710122628d704341be80a8ea99814597c54":{"cyrillic":true,"latin":true,"category":"unknown"},"519349bbd35e5cbf8e54301efab145d467c22557":{"cyrillic":true,"latin":true,"category":"unknown"},"d3919af4aa109d193aa88089df6eb8a6400c255c":{"cyrillic":true,"latin":true,"category":"unknown"},"93d0aee3592070ad8daa556c1f9677feebfa6c8b":{"cyrillic":true,"latin":true,"category":"unknown"},"770284d29efcfee4b9f87fbd54c31bddf034eb7c":{"cyrillic":true,"latin":true,"category":"unknown"},"c9b6c5bc509381fc83c66c33f43ba4760cf9193d":{"cyrillic":true,"latin":true,"category":"unknown"},"7db826a002450d6cde8d76b6750b2e71c625f0d3":{"cyrillic":true,"latin":true,"category":"unknown"},"f0df31481298e56a38964df57e64aba6226f306c":{"cyrillic":true,"latin":true,"category":"unknown"},"91a4fbe68ac57567ac06f847b65105897b9fdff5":{"cyrillic":true,"latin":true,"category":"unknown"},"4c0992850c658490a889f372393ffb35685d95a4":{"cyrillic":true,"latin":true,"category":"unknown"},"b3fbec52c2ac592630960379cd45015af383576b":{"cyrillic":true,"latin":true,"category":"unknown"},"3e796f04ac691c0beb4dad1a06a913c3b95a1445":{"cyrillic":true,"latin":true,"category":"unknown"},"ac043dc8f9427de6c2e9df7aa88316827fcc7c53":{"cyrillic":false,"latin":true,"category":"sans"},"126769cd558b8559d0bea3597f150f617324de26":{"cyrillic":false,"latin":true,"category":"unknown"},"08d6e4f5af1427ea7accd19819dfb18ed92fbe59":{"cyrillic":false,"latin":true,"category":"unknown"},"6009c2be799c5622e5045e159f3631b82f6c6135":{"cyrillic":false,"latin":true,"category":"decorative"},"032814d2ef0be75906a3f51cc292ab9c4eedec52":{"cyrillic":true,"latin":true,"category":"unknown"},"0bec67584c9b6fbdd0ebc5d03070b4fd9ae561d1":{"cyrillic":true,"latin":true,"category":"unknown"},"5638d0ebe06a23afa24b8fc506bfd0a5fa920941":{"cyrillic":true,"latin":true,"category":"unknown"},"8b73949f1317cf8ce42d4d4f4b01720f1a2a3ab2":{"cyrillic":true,"latin":true,"category":"unknown"},"34ba8a96db9a76a14f177bb61182e1ce6fbed907":{"cyrillic":true,"latin":true,"category":"unknown"},"79bac8b148723c761dfff583c1eac9c8bc438fe1":{"cyrillic":true,"latin":true,"category":"unknown"},"ea09a09f690eff854cd32feddb076410ce66b0e4":{"cyrillic":false,"latin":false,"category":"decorative"},"1858e1d9c3d94532ee2f56a2beecd62b13ab0395":{"cyrillic":false,"latin":true,"category":"unknown"},"2c36a9996dce207d36c1844aab8caf543899ea0e":{"cyrillic":true,"latin":true,"category":"monospace"},"67dcfdd780cd1b8f663845b931be2bb4f6083e5c":{"cyrillic":true,"latin":true,"category":"monospace"},"9d18d68bb5b61316e1dcfb2076e015185f306ec6":{"cyrillic":false,"latin":true,"category":"unknown"},"1b6700e185ce4525083426be97d947e60dba05f4":{"cyrillic":false,"latin":true,"category":"unknown"},"fc16fe1ce03af8c34970ed5f2da165e8e1098ff6":{"cyrillic":false,"latin":true,"category":"sans"},"6ed16c05a28c4fa70d19a00cb07e94515dcf0b35":{"cyrillic":false,"latin":true,"category":"unknown"},"8556a8cb4fadec1a50175c040bcd974ffeaf855d":{"cyrillic":false,"latin":true,"category":"unknown"},"a83db558ced4eddd9044cb3a8874dc881d3c21a2":{"cyrillic":false,"latin":true,"category":"unknown"},"bacfaf44319219a7169f1aa2e3d61f78ff85b00f":{"cyrillic":true,"latin":true,"category":"serif"},"78cebed3ed544e78be6350ee3b9f28e0230e4c1e":{"cyrillic":true,"latin":true,"category":"unknown"},"6ac62ea0509ea80c48bf52b1bc31bc505b1f9464":{"cyrillic":true,"latin":true,"category":"unknown"},"066a674e9f55996e0bf49015aa4fbb2a1c5dd3bb":{"cyrillic":false,"latin":true,"category":"decorative"},"bd482ca222f9cad390591cf4aa1a2af1eea78110":{"cyrillic":true,"latin":true,"category":"sans"},"eb1912df1b3a918b7475dd21e13ae1f004898b64":{"cyrillic":true,"latin":true,"category":"sans"},"d2626b151e3b1b57e07d9ad2ea19e352d154592c":{"cyrillic":false,"latin":true,"category":"decorative"},"eb3bb3b676d22c50553d8d3ec8087143271e5e1f":{"cyrillic":true,"latin":true,"category":"sans"},"266944198661a0633b8e30914e4b47907729380d":{"cyrillic":true,"latin":true,"category":"unknown"},"a26e9ed2482696e0dad86fc71837c184036d351f":{"cyrillic":true,"latin":true,"category":"unknown"},"cc6ab9bd3d4dc15674465120a71193e359a98bd2":{"cyrillic":true,"latin":true,"category":"unknown"},"2ca3f5247214d044d67793b0bb2174fd3d0eee61":{"cyrillic":true,"latin":true,"category":"unknown"},"6e5fb66fe3f36db2cc55e390e19d1bca0745fc43":{"cyrillic":true,"latin":true,"category":"unknown"},"b891c0fbefd5a5cae6fd2f9af39574e443eabee5":{"cyrillic":true,"latin":true,"category":"unknown"},"e9bdb5df43bf608f3d08bbd067532a73b680a67b":{"cyrillic":true,"latin":true,"category":"unknown"},"4de188dd5fb37a43967e25f5faa0fa9888cc50c6":{"cyrillic":true,"latin":true,"category":"unknown"},"b9cf0bd5a46391184c8f906d4bccc2f92788e067":{"cyrillic":true,"latin":true,"category":"unknown"},"7b25d8206c0f0e277170cf375e563b83d47e8626":{"cyrillic":true,"latin":true,"category":"unknown"},"f8bd76ec1e085ffffb9105a534c3ff8137874e4e":{"cyrillic":true,"latin":true,"category":"unknown"},"6e79419c64d7d47b9ebedff58ae4e55870fd9697":{"cyrillic":true,"latin":true,"category":"unknown"},"53100dc87737027a8710451d8e78a79be4c50157":{"cyrillic":true,"latin":true,"category":"unknown"},"176e229b78c32b4e0a8c3deca2b17dde4f032c15":{"cyrillic":true,"latin":true,"category":"unknown"},"2e4594c36901bb58e8b66bb25d80c3b29094148d":{"cyrillic":true,"latin":true,"category":"unknown"},"dc2e231ff6c6bd710ce5fa8248dd8506d739f80a":{"cyrillic":true,"latin":true,"category":"unknown"},"6d2ad5d278037cc5e20b7018a88f0e962be483d2":{"cyrillic":true,"latin":true,"category":"unknown"},"7334d99bc5466e33c80a5b13306344761cf93d17":{"cyrillic":true,"latin":true,"category":"unknown"},"5954871064d4e480155c9de95f76c06191477958":{"cyrillic":true,"latin":true,"category":"unknown"},"8c43b371483cd17ca1dd0fb13d1536ba6c4562d3":{"cyrillic":true,"latin":true,"category":"unknown"},"c0392697e22f841d01ea75cfdbcd9547c8319fec":{"cyrillic":true,"latin":true,"category":"unknown"},"e93ba5f1ed8243f2337ad2ab2682812c88802fd2":{"cyrillic":true,"latin":true,"category":"unknown"},"96a03d366fa94967a3328ba1a70410cfa568ebd3":{"cyrillic":true,"latin":true,"category":"unknown"},"d0b52c549d6380a978456a54c6c585630f14483b":{"cyrillic":true,"latin":true,"category":"unknown"},"004631dd009dc59219a0f4454cbec5d328502318":{"cyrillic":true,"latin":true,"category":"unknown"},"163bccb9fcfe5e203f996bd3c88f7701187fe5c6":{"cyrillic":true,"latin":true,"category":"unknown"},"297b5f83a717620ea8a1e4595ab2315a8276ab14":{"cyrillic":true,"latin":true,"category":"unknown"},"aef67b602ece34a8480baacf9cedb2109e6fe389":{"cyrillic":true,"latin":true,"category":"unknown"},"39463aae47fd35740d20d8e9220805ca2b1a15b3":{"cyrillic":true,"latin":true,"category":"unknown"},"2cc5360f3aeef3a3118a3c4f9c9a35bc5cdfac1e":{"cyrillic":true,"latin":true,"category":"unknown"},"d1db5b10021210a8142502c8ca56280d84811264":{"cyrillic":true,"latin":true,"category":"unknown"},"16f5131a30b6ac3bf8a55dbe8ba6dde020df93b1":{"cyrillic":true,"latin":true,"category":"unknown"},"60d2188cb030bbbee0d88de82a38f52ad07c5a32":{"cyrillic":true,"latin":true,"category":"unknown"},"c864becf0835b1408a6a7fef5cbc60232437cbca":{"cyrillic":true,"latin":true,"category":"unknown"},"2fe3549adf01f230b27c9f32ab0358c1b48ebef5":{"cyrillic":true,"latin":true,"category":"unknown"},"50e66d3e664cc2d089500338554839b48ff2ae1b":{"cyrillic":true,"latin":true,"category":"unknown"},"511514512d05b04b28d18f1240edd457b2be16d0":{"cyrillic":true,"latin":true,"category":"unknown"},"5e48968a58cdf39b70d20d4515b4cb5eb26eb5e9":{"cyrillic":true,"latin":true,"category":"unknown"},"c48b2d959dddecaa13d6b7a41b27fd9148881771":{"cyrillic":true,"latin":true,"category":"unknown"},"618494df01fa79f2020af56b99013fedd837b04c":{"cyrillic":true,"latin":true,"category":"unknown"},"378934aff0acc18687adcb6d7b857d8c69e51926":{"cyrillic":true,"latin":true,"category":"unknown"},"f4a2457fcad4882615f3aec4f288cfcea9d315ff":{"cyrillic":true,"latin":true,"category":"unknown"},"13fd374c2f58863041a3be6e57b067983ee72198":{"cyrillic":true,"latin":true,"category":"unknown"},"2fe7ea1842f6af888be5ee304a3d37a7cf62a0a0":{"cyrillic":true,"latin":true,"category":"unknown"},"a8a31e3d21c6cd1e45ccf07ddbc4b15212fe7ab2":{"cyrillic":true,"latin":true,"category":"unknown"},"453caf7fcd6548dc1404b6cedb0f1f0f04ce48cf":{"cyrillic":true,"latin":true,"category":"unknown"},"c6fa095449fbcdbe688ae097311f55ab916b094b":{"cyrillic":true,"latin":true,"category":"unknown"},"a7464e6b4bf2e958d995982818cd803a69d056fd":{"cyrillic":true,"latin":true,"category":"unknown"},"097efdfc8c994cdc3cfe8d05177ae3f0f3ad37a9":{"cyrillic":true,"latin":true,"category":"unknown"},"adba03b8eff1e3dd9fd346f4618499dda20e9f51":{"cyrillic":true,"latin":true,"category":"unknown"},"0d1b085bd3c3934ae145d667761f2bfae4ed458f":{"cyrillic":true,"latin":true,"category":"unknown"},"b213dff6568d02f6b5e7025e761bf1e3317e7dfe":{"cyrillic":true,"latin":true,"category":"unknown"},"a247e92603a8709b95352f54c081bad145d6fdb0":{"cyrillic":true,"latin":true,"category":"unknown"},"5a0048321f72b28f477c24b2481b09bbbcca5036":{"cyrillic":true,"latin":true,"category":"unknown"},"fd0609e1fb8564fd0ce91359605185a31ad2aca8":{"cyrillic":true,"latin":true,"category":"unknown"},"c0ef05c475f71558be095f1c05a12131fc35e125":{"cyrillic":true,"latin":true,"category":"unknown"},"ae78278f354606f8e940f6b2e741e726c426e846":{"cyrillic":true,"latin":true,"category":"unknown"},"dd72f8cc74c1cab15a490cf6d39250510388fb55":{"cyrillic":true,"latin":true,"category":"unknown"},"49227d1337be26e799b9fc4e3ac7fa99d6f65287":{"cyrillic":true,"latin":true,"category":"unknown"},"a3048f4c23eeafe632608bb9b6182043de424c22":{"cyrillic":true,"latin":true,"category":"unknown"},"8e8124f5fb73feb621f22dec12b84927246ac084":{"cyrillic":true,"latin":true,"category":"unknown"},"96f21e525d7cdcf35314eaac6e85eadfe59028a9":{"cyrillic":true,"latin":true,"category":"unknown"},"c09174f478bbdaf0017ca2e53449d42f93fe22fa":{"cyrillic":true,"latin":true,"category":"unknown"},"af94eb40d3eb4b550fde8c46554aa5f583072d90":{"cyrillic":true,"latin":true,"category":"unknown"},"6781a932aa0450ee56efb11251e3e6ed03699fa9":{"cyrillic":true,"latin":true,"category":"unknown"},"b1da86bcb3c9ad75e20c6138287f862ace488353":{"cyrillic":true,"latin":true,"category":"unknown"},"852af2f9e294755b564dfb6b082d3ee53e2a8888":{"cyrillic":true,"latin":true,"category":"unknown"},"7a1853904660e6ac5c206afb216233749e9eb695":{"cyrillic":true,"latin":true,"category":"unknown"},"2d6a07011b0a3d7eb499d06b8ccb0bdfeba7f405":{"cyrillic":true,"latin":true,"category":"unknown"},"75444b57cae368a0cbb7b76391c6cd9df592d183":{"cyrillic":true,"latin":true,"category":"unknown"},"958e52df31e76591e3b843fbf29cd7a3d37472d4":{"cyrillic":true,"latin":true,"category":"unknown"},"febe7e3666faefdeaae94afa269c69ca0ec7f54a":{"cyrillic":true,"latin":true,"category":"unknown"},"2f191009e0c96bae2ad82e281d0850727f399e7e":{"cyrillic":true,"latin":true,"category":"unknown"},"f7174256712b5ac2c4b2c3f3d10135dd006fc63f":{"cyrillic":true,"latin":true,"category":"unknown"},"67057995b63ebf7ce6c56478d3da5869a053f7e4":{"cyrillic":true,"latin":true,"category":"unknown"},"8ba13f87624bf627f730cd9f78fc5e5b091c2a86":{"cyrillic":true,"latin":true,"category":"unknown"},"fd40f0abb7117932d0c94d03c36f2a3418d5f6c5":{"cyrillic":true,"latin":true,"category":"unknown"},"c0f52feab05751f1f1445db7f0152a9606fcfb36":{"cyrillic":true,"latin":true,"category":"unknown"},"d5bb91d497965cd9b54b033c9327bfe47e8966d7":{"cyrillic":true,"latin":true,"category":"unknown"},"33363786a3c010aa684683e2f742c9e0239402da":{"cyrillic":true,"latin":true,"category":"unknown"},"5e44522ad5853436ef9c6fe332c6c007962373e6":{"cyrillic":true,"latin":true,"category":"unknown"},"2596f5601333a372220a315702e145961f558b22":{"cyrillic":true,"latin":true,"category":"unknown"},"00b2555710dadd3bf87e7431b116c6174c24e52e":{"cyrillic":true,"latin":true,"category":"unknown"},"7ed3bb17c683bdb4be20736a04d5f4455289e6d5":{"cyrillic":true,"latin":true,"category":"unknown"},"7a0293fa3127b1810829a809d9bd7d0268270ae8":{"cyrillic":true,"latin":true,"category":"unknown"},"994f0843d8fae36d7731a537dcb2b221fb20d2f3":{"cyrillic":true,"latin":true,"category":"unknown"},"e0737d26c198988621904ed53cf0cc8a319f343b":{"cyrillic":true,"latin":true,"category":"unknown"},"0c4490c225aee93cb4bb95ab7b19454d4d4d31d8":{"cyrillic":true,"latin":true,"category":"unknown"},"33c9de79fc8583ace8ff4bdf6b291f47b80aebe0":{"cyrillic":true,"latin":true,"category":"unknown"},"f2add7a670daaadb81ea796df9da38167e23bb83":{"cyrillic":true,"latin":true,"category":"unknown"},"16ce9426edd884a7efb6f028706c57534a086735":{"cyrillic":true,"latin":true,"category":"unknown"},"3c28565be8b76a2a5f841e924f294807eaef41d2":{"cyrillic":true,"latin":true,"category":"unknown"},"0ac2bf2a6bd837084869c9614f47f7f6c2b668ea":{"cyrillic":true,"latin":true,"category":"unknown"},"bc3f0958b4069b6da84c9b2f8ae95618893322af":{"cyrillic":true,"latin":true,"category":"unknown"},"2a8f261a43b415a8908da1f5a4cb2aceb5681fd7":{"cyrillic":true,"latin":true,"category":"unknown"},"9602ba46eb6b553be313b007b4c7c43d8ab06c46":{"cyrillic":true,"latin":true,"category":"unknown"},"d9d2d62eaf25876b1981db89a1a0f43159fb4a85":{"cyrillic":true,"latin":true,"category":"unknown"},"70672fa1f4857a0a6f27911585347d29386f93b1":{"cyrillic":true,"latin":true,"category":"unknown"},"c3aeef323b5101da2afe48b1a4910e59a3943935":{"cyrillic":true,"latin":true,"category":"unknown"},"f9b02cfdc81df8df0707184c4b19c8305582e0d4":{"cyrillic":true,"latin":true,"category":"unknown"},"1fac0d3000e7c129e73590c6cc4c5977f7e30251":{"cyrillic":true,"latin":true,"category":"unknown"},"ffe60a65d435c6da6620a394a20b850d1fabbe2c":{"cyrillic":true,"latin":true,"category":"unknown"},"64bc5c5138ba2720690aa215a587f53973a6ad1e":{"cyrillic":true,"latin":true,"category":"unknown"},"97fcf58f101c46bb6a3a8a67a15f541d902590a3":{"cyrillic":true,"latin":true,"category":"unknown"},"cb7b11d6b7bc8172af16eaadf8c678e69aa68dd4":{"cyrillic":true,"latin":true,"category":"unknown"},"43a8e7105a63a4777938437db246d44e02e4673d":{"cyrillic":true,"latin":true,"category":"unknown"},"34a18b4a803aa502ced2581ab816af4ac2f3b5c4":{"cyrillic":true,"latin":true,"category":"unknown"},"c5a7a52569397202f98c205cf648053e2f06a7d3":{"cyrillic":true,"latin":true,"category":"unknown"},"f309c018847ed3094b580cf3acf0c823b0eeaa65":{"cyrillic":true,"latin":true,"category":"unknown"},"5b39a3a89cbf10ff1af46d5e2f5eb63145e70ca5":{"cyrillic":true,"latin":true,"category":"unknown"},"a5f6ec7e00a1b11a68351f650a8a4eff007b2fd0":{"cyrillic":true,"latin":true,"category":"unknown"},"75360e6b1d2044b125ec486517b96b2882f9553d":{"cyrillic":true,"latin":true,"category":"unknown"},"0939428907b6724ba213640e377c3f5c8f0cba51":{"cyrillic":true,"latin":true,"category":"unknown"},"7c3be2e5d35e40e0b1f5f4c556dd1bb6a96c3efe":{"cyrillic":true,"latin":true,"category":"unknown"},"47ad8567bc495d7e75d44138bf71c54b9db9bcad":{"cyrillic":true,"latin":true,"category":"unknown"},"f9e686ed8adda73c0a8e7292bba213188795532f":{"cyrillic":true,"latin":true,"category":"unknown"},"702e19ebcad3770256a8e89eca81a326f08fe999":{"cyrillic":true,"latin":true,"category":"unknown"},"7458a6578fe1df68473ce713a4c58bfda36c0f3b":{"cyrillic":true,"latin":true,"category":"unknown"},"869aad95bf121b187bbf81a9029ed09501da9058":{"cyrillic":true,"latin":true,"category":"unknown"},"df28fa36a66e93237e4290abad308905c9c5b0bf":{"cyrillic":true,"latin":true,"category":"unknown"},"20ff614562a55658fa3a0ed11faaf476bd75bc7a":{"cyrillic":true,"latin":true,"category":"unknown"},"e6f52cbedf3b42e570786ac37b1647289b4d0393":{"cyrillic":true,"latin":true,"category":"unknown"},"1fa691e5131e567c88f0d54e23d8005692fae083":{"cyrillic":true,"latin":true,"category":"unknown"},"6d37a4ab3d130c8da31b30532e9e91e479b35eb2":{"cyrillic":true,"latin":true,"category":"unknown"},"59c896a6edcdfac1100f1de1aa2e35ce2dfa3777":{"cyrillic":true,"latin":true,"category":"unknown"},"6039b8fca584cf2cd4f747e1e5fc5060cccb3823":{"cyrillic":true,"latin":true,"category":"unknown"},"b3401049f6d46cab9cad867e90a4ed6dc4f066d3":{"cyrillic":true,"latin":true,"category":"unknown"},"f88af2ade2e9bc342fad083677cfc2e1d6003b0a":{"cyrillic":true,"latin":true,"category":"unknown"},"9cefaca1d6e434c572aa3ece3715528f87610306":{"cyrillic":true,"latin":true,"category":"unknown"},"c09733702919095e65ae8a33d4c6c4b9f96789e1":{"cyrillic":true,"latin":true,"category":"unknown"},"2ff0421f0b411c1509a0ed1da18cc4d5bda82edf":{"cyrillic":true,"latin":true,"category":"unknown"},"6e5bf902bd3a2bd88ad6ab958d4d82239451bb13":{"cyrillic":true,"latin":true,"category":"unknown"},"23db30693e7a1e1e5330c3992ec88090baece3e4":{"cyrillic":true,"latin":true,"category":"unknown"},"9dae5d144b67dc9b9ca9d29908a15d175db19ece":{"cyrillic":true,"latin":true,"category":"unknown"},"105344002df77621f6bdbf48c50e561a182eec88":{"cyrillic":true,"latin":true,"category":"unknown"},"170660954271492dff8e4aaa35f56c9b5e3c0da9":{"cyrillic":true,"latin":true,"category":"unknown"},"91594d474256e49fc475f9311208fc7c6e94dca0":{"cyrillic":true,"latin":true,"category":"unknown"},"d79c2568d418397de76bc0b6c62228532a3262c5":{"cyrillic":true,"latin":true,"category":"unknown"},"09616d42fe3ed6bc3904e1e2419e8dc36279ccc9":{"cyrillic":true,"latin":true,"category":"unknown"},"15717c60660f796384cff7881f8c0993436ac596":{"cyrillic":true,"latin":true,"category":"unknown"},"a4ada4dc03e562c3b271e6c88cd2ef785352a682":{"cyrillic":true,"latin":true,"category":"unknown"},"b9cb320cb3d1378b89659bf760c0e8f7cc2f0dc6":{"cyrillic":true,"latin":true,"category":"unknown"},"ebbdceeeeff97c406cd3981a5c33ec248e8871f8":{"cyrillic":true,"latin":true,"category":"unknown"},"5c741ff7e45c87b26138e3bea2587fdf8ae50138":{"cyrillic":true,"latin":true,"category":"unknown"},"d6fce351234323ddd7899653e8d4315ce64b2dd6":{"cyrillic":true,"latin":true,"category":"unknown"},"fabaed79c3eeff3968cd169378d7db454930e814":{"cyrillic":true,"latin":true,"category":"unknown"},"7fbb45625642a622d99ddf9a77c39f99f5f68aed":{"cyrillic":true,"latin":true,"category":"unknown"},"395315fe90816956d31227898c21061ed5913041":{"cyrillic":true,"latin":true,"category":"unknown"},"7225a8cc820160da4f74b004af9a4f8b385f1645":{"cyrillic":true,"latin":true,"category":"unknown"},"700049ea6bede1cdde0c4e1266210e447a7379b5":{"cyrillic":true,"latin":true,"category":"unknown"},"9062e172e3b6d573a3fc54758c18692326bb5c69":{"cyrillic":true,"latin":true,"category":"unknown"},"0831df30c294030c75315d6c4db2c9cdfd4d543a":{"cyrillic":true,"latin":true,"category":"unknown"},"89fa1cd10f9909e848aec04503ae6e74ef809bb4":{"cyrillic":true,"latin":true,"category":"unknown"},"55dfbef34eec181a320d260945fa3510ad2723bd":{"cyrillic":true,"latin":true,"category":"unknown"},"a9558cb8b6afae7c438d9d3072fdf460c2d394a1":{"cyrillic":true,"latin":true,"category":"unknown"},"4e24a34d5cb280c65cba0ba6d0104867c7c7e954":{"cyrillic":true,"latin":true,"category":"unknown"},"f568c47af77765aa990f36caa74b66f07727c144":{"cyrillic":true,"latin":true,"category":"unknown"},"b61f8391cbe4ef1374d2081427f87c73965706ca":{"cyrillic":true,"latin":true,"category":"unknown"},"406fbf314755efc19e7644bdf3678f08c1a4b348":{"cyrillic":true,"latin":true,"category":"unknown"},"49b76d9a5a32732136ef23a67128f68983796a6d":{"cyrillic":true,"latin":true,"category":"unknown"},"f21146d200c46a9938312ea8e6995d0751ee64f2":{"cyrillic":true,"latin":true,"category":"unknown"},"075a50fd77cafacb1d09c8ffb0dadd94e5d58e5a":{"cyrillic":true,"latin":true,"category":"unknown"},"2dcef1ab68e9cec97d603fe3c0dd1fb20a59be6b":{"cyrillic":true,"latin":true,"category":"unknown"},"9093865636f76760108da3fef176f30779eb58e1":{"cyrillic":true,"latin":true,"category":"unknown"},"1ce6c91cb617c31609d6f65343245379ec85d619":{"cyrillic":false,"latin":true,"category":"unknown"},"13f91ce443d461046451cd5b110314f250765e25":{"cyrillic":false,"latin":true,"category":"unknown"},"f186c0672e1ef8455bcc9d6e057e1ad92d9209bd":{"cyrillic":false,"latin":true,"category":"unknown"},"87c4c559f85ba3cc3f32835bb34f7760f56c70c5":{"cyrillic":true,"latin":true,"category":"unknown"},"e3fc06e03b42b43c902c55a8567b21b7b6737752":{"cyrillic":true,"latin":true,"category":"unknown"},"b090bc3a458b6512b85861940c03ae10144c91e6":{"cyrillic":true,"latin":true,"category":"unknown"},"dbcfdb45ea58f91f4c398e164c3a61ff83335511":{"cyrillic":true,"latin":true,"category":"unknown"},"28bd8b2fbdd3c6ed652ba3852bda25034e69eebb":{"cyrillic":true,"latin":true,"category":"unknown"},"b9c1245c6fc220692e1a4226ce3aed80f1fc54bf":{"cyrillic":true,"latin":true,"category":"unknown"},"ea9b9b259a145542fdcaab52166876ffdbdbc068":{"cyrillic":true,"latin":true,"category":"unknown"},"f4b8aa7118d7f26c88cff6412e58724da3681bc3":{"cyrillic":true,"latin":true,"category":"unknown"},"ee3a30ef7554c0a81fe803e1e491482fc164b620":{"cyrillic":true,"latin":true,"category":"unknown"},"0a3e32c1848433d02d730eb4303b3976e69b0611":{"cyrillic":true,"latin":true,"category":"unknown"},"4a6b3fa5ae72bea72c8dab548133f12453a05bba":{"cyrillic":true,"latin":true,"category":"unknown"},"803e92558a439a8cfcf0b70c337d57ad43692abd":{"cyrillic":true,"latin":true,"category":"unknown"},"7b59bb169cb62a5ba24e1ebd719134971286b6f6":{"cyrillic":true,"latin":true,"category":"unknown"},"ff79431ad0add02379bdf22865d08f2b5af17c5a":{"cyrillic":true,"latin":true,"category":"unknown"},"9bfaa560193e9200847397ddba157d4de8918072":{"cyrillic":true,"latin":true,"category":"unknown"},"e285e7974cac5f78adf6623d8906042ca4960033":{"cyrillic":true,"latin":true,"category":"unknown"},"0ea329decd8da1eb810533640459fb74a4038652":{"cyrillic":false,"latin":true,"category":"unknown"},"88850e271329243e619fc637a86d3fae7433c2a4":{"cyrillic":false,"latin":true,"category":"unknown"},"76e3de52005f5ade034f5ed041d9a4dbb9fc8f64":{"cyrillic":false,"latin":true,"category":"unknown"},"8810d49ae007e5d3ad17909a64f3a015fc719ed0":{"cyrillic":false,"latin":true,"category":"unknown"},"0257e1229951b922c19c806893b2968c51733e77":{"cyrillic":false,"latin":true,"category":"unknown"},"1261e1e9a7683d468c86b31b6651189caba897a9":{"cyrillic":false,"latin":true,"category":"unknown"},"b07041a10d5dfb9140ab750c4f4e396d137d65a1":{"cyrillic":false,"latin":true,"category":"unknown"},"6c932588e2ac633610bf5334cfa8af3f719e96ad":{"cyrillic":false,"latin":true,"category":"unknown"},"c67aaa9ba61998ee2c3387d7730d466d6e31e1d1":{"cyrillic":false,"latin":true,"category":"unknown"},"74cf43dfb5daa809e3abb4c66178f41083e7894d":{"cyrillic":false,"latin":true,"category":"unknown"},"0249ad957c3a5aecd2ebebd069f7b5da066b6c94":{"cyrillic":false,"latin":true,"category":"unknown"},"f379e78c9317cac3a546553458bf58cd685d392f":{"cyrillic":false,"latin":true,"category":"unknown"},"9e8d6b41b830623d54e4f884eaf085687f2fbe6a":{"cyrillic":false,"latin":true,"category":"unknown"},"0768591ee10a0ff66ff4c2d7c687cb417df05104":{"cyrillic":false,"latin":true,"category":"unknown"},"929f541334afe62c78cd84575f8e6dec820481d7":{"cyrillic":false,"latin":true,"category":"unknown"},"a2e54e43d5fd97f8c36b715e4e741d8c9e37275f":{"cyrillic":false,"latin":true,"category":"unknown"},"71f4558e02dc2b55227a155a1e6d6d3366468723":{"cyrillic":false,"latin":true,"category":"unknown"},"574528f6d9f37b76fabe177e0442db0b0a665e2d":{"cyrillic":false,"latin":true,"category":"unknown"},"d646d5c48619a4ecf5702efbff2eb31884bed232":{"cyrillic":false,"latin":true,"category":"handwriting"},"eb3ee9eb3383b7af9706aec0d034eb38e2342001":{"cyrillic":false,"latin":true,"category":"handwriting"},"f6d9c9dc5fa90f1bdc4da3fe9c7e7c700fb34338":{"cyrillic":false,"latin":false,"category":"symbol"},"b1864d3bc258e52ee6094d91cdaf955cc6e769ae":{"cyrillic":false,"latin":true,"category":"serif"},"642e56a293ebb86d5c382b111171f7327c00fd52":{"cyrillic":false,"latin":true,"category":"serif"},"529187bd64fe6de30810d51a181a6566ba34f4f4":{"cyrillic":false,"latin":true,"category":"sans"},"b02b463cb89f47bcc6fea5c738e7d2d9001fc948":{"cyrillic":false,"latin":true,"category":"sans"},"762f6821e3aa84f46a12df48960bb6f3f0b1c746":{"cyrillic":false,"latin":true,"category":"sans"},"25f7b6c95c57ad80f6e17c05fc7551fa6dd5d102":{"cyrillic":false,"latin":true,"category":"sans"},"27108180e32adcd0d595363ad7f89db3a5989cae":{"cyrillic":false,"latin":true,"category":"sans"},"a7573f79d09dc21070f57549115eac611387048a":{"cyrillic":false,"latin":true,"category":"sans"},"c93e36a315aa5725e7c7e254fbb5f30fe4454838":{"cyrillic":false,"latin":true,"category":"sans"},"b41e8d26cd55931c9ce39a45e2050d617d6f4d42":{"cyrillic":false,"latin":true,"category":"sans"},"c09b1b2646babb48e8830e68353025ece1fb848a":{"cyrillic":false,"latin":true,"category":"sans"},"3288c188323ada1d024fdab0214da1f897685e12":{"cyrillic":false,"latin":true,"category":"sans"},"1f4698fac1c0132521ca4c0f4c8c1422b7869e3e":{"cyrillic":false,"latin":true,"category":"sans"},"ab79b16f08d22c6bc1b7b6f63f9ff3f80fcf41c9":{"cyrillic":false,"latin":true,"category":"sans"},"eb61fa3b4f17042b360c346ee795743c1f86a9f0":{"cyrillic":true,"latin":true,"category":"sans"},"693abc328b2df2ec85aab4fcd55a7fc3a364820d":{"cyrillic":true,"latin":true,"category":"sans"},"16f652da1473a6c9d27a792706fb2b5f08748cbf":{"cyrillic":false,"latin":true,"category":"decorative"},"a54782d93e80235f694caa006a51d03da5920abb":{"cyrillic":true,"latin":true,"category":"handwriting"},"12435e4119861fb7eea361278ab45c6c38f2519b":{"cyrillic":false,"latin":true,"category":"handwriting"},"66b3a75aebf0425e5b8fa77fb845999b7e6df835":{"cyrillic":false,"latin":true,"category":"handwriting"},"954cf29df3f0d5de0c1c9620708b4d8a8e602bc0":{"cyrillic":false,"latin":true,"category":"unknown"},"394d5a1638e1802b589908ca65f41b573b61d674":{"cyrillic":true,"latin":true,"category":"handwriting"},"a41f8946341e4772299dd59f8b94d9632e842b19":{"cyrillic":true,"latin":true,"category":"unknown"},"cd04bbcfd9321f7e13f5c8b5d8a762e75bbe2b24":{"cyrillic":true,"latin":true,"category":"unknown"},"7afeecc22e9570ad6430337dccae0f93f1b450fd":{"cyrillic":true,"latin":true,"category":"unknown"},"5531e5fd90208cabeb23230b02047206b1a55478":{"cyrillic":true,"latin":true,"category":"unknown"},"6f8cfca2336f8f52ccda537d4c8ded5f2d793a54":{"cyrillic":true,"latin":true,"category":"unknown"},"edb28f2b3d7990052ea0c77283168e4bab75447a":{"cyrillic":true,"latin":true,"category":"unknown"},"b97a10e23e8ac3596d0f4b0debd3c487ad08e893":{"cyrillic":true,"latin":true,"category":"unknown"},"4ab6fd7bc91220168a6781325ddde3e3185bd738":{"cyrillic":true,"latin":true,"category":"unknown"},"3b2068445e243dcd8a2821dd2712495a5aafbd4d":{"cyrillic":true,"latin":true,"category":"unknown"},"d514f410a1ac2374f8a840268568c5daeffa6e90":{"cyrillic":false,"latin":true,"category":"unknown"},"9f2fb89688cdb420f708736e4f8247b42f2c7755":{"cyrillic":false,"latin":true,"category":"unknown"},"e93f34d2beddc5fe9428faa8b4dcb3d7a201a416":{"cyrillic":false,"latin":true,"category":"handwriting"},"f34258720029816cfde6d9c3a52d482abe667a89":{"cyrillic":false,"latin":true,"category":"handwriting"},"811308edf5a191de4f5e7eaae5b49a83568ddaa3":{"cyrillic":false,"latin":true,"category":"handwriting"},"702709da1968102135aa93b560eaaee6e6ab0fe0":{"cyrillic":true,"latin":true,"category":"sans"},"9e557b19406cc1ed2c617cd27bd492c335237770":{"cyrillic":false,"latin":true,"category":"unknown"},"491b12b6abfce2b2c48b2c75746aa5ccbb3c8586":{"cyrillic":false,"latin":true,"category":"unknown"},"c9931dceabbe92aa65f7e9efdfca1948135c1498":{"cyrillic":true,"latin":true,"category":"unknown"},"9a05c231c5b7547e1b85d8bb9f14e0dbdc879701":{"cyrillic":false,"latin":true,"category":"decorative"},"fca74ca1bf92b2dc3e82bf0fddceb22dcadfa55d":{"cyrillic":true,"latin":true,"category":"unknown"},"1d13b841509a1f10c091ef911d5cb6cf1e5efce0":{"cyrillic":true,"latin":true,"category":"unknown"},"2e1ce29f28ca4942eb239c78cbfa2048f10a23eb":{"cyrillic":true,"latin":true,"category":"unknown"},"949a30f6848e390be81ee91f532e66604dbacadd":{"cyrillic":true,"latin":true,"category":"unknown"},"e0bf1c5c9c670129fa29f77005b3922f26b3f301":{"cyrillic":true,"latin":true,"category":"unknown"},"9eb2d234d3f38784d84de8a671f9a5fdc6234273":{"cyrillic":true,"latin":true,"category":"unknown"},"3c5565d0a91f509d23779ee0648ec5427ade3714":{"cyrillic":true,"latin":true,"category":"unknown"},"99075c78e3fb93bf53832af5423883f0adbc3536":{"cyrillic":true,"latin":true,"category":"unknown"},"573a5348db593896dea6f03f67e7f80743f8f673":{"cyrillic":true,"latin":true,"category":"unknown"},"23dbedb904814ca5fbf22f1c1bb6b0b33f46a8aa":{"cyrillic":true,"latin":true,"category":"unknown"},"5ceb6c097ea45dcac700b002e2e578ba7d39af04":{"cyrillic":true,"latin":true,"category":"unknown"},"8654e2b05fc7d930c69f8a46f3754336605c1014":{"cyrillic":true,"latin":true,"category":"unknown"},"1767ab84d0fd1e78092556f4bd5713c6c50ca000":{"cyrillic":true,"latin":true,"category":"unknown"},"429a0afbf43efaadf89a05f06865404bdefe47ba":{"cyrillic":true,"latin":true,"category":"unknown"},"657157f3650d011078ec7641a90c90a3766b8c60":{"cyrillic":true,"latin":true,"category":"unknown"},"b41bc84250f22ef98e1aca1683bbb8540b48115a":{"cyrillic":true,"latin":true,"category":"unknown"},"64c72a00f0b17841441148be4b509bb0b42426f3":{"cyrillic":true,"latin":true,"category":"unknown"},"047caa3dcbc26a7861c46ba973eeac366b9845ba":{"cyrillic":true,"latin":true,"category":"unknown"},"eb8c79f4ecaf450d0c00cab22d84b5e7854c7c48":{"cyrillic":false,"latin":true,"category":"handwriting"},"8024486b54c9b536de5faf13eea4ac899783225a":{"cyrillic":false,"latin":true,"category":"handwriting"},"48ac218644704e0df42e219b3ae1b7537f185280":{"cyrillic":false,"latin":true,"category":"sans"},"f6f46cc778788e2ad6f7ba9873e0cabb67c0c0a9":{"cyrillic":false,"latin":true,"category":"unknown"},"7ae20b714d853f87b2fa74214fbb3e803214d474":{"cyrillic":true,"latin":true,"category":"unknown"},"b171f89f7a06bbac4a3923b2ba5472a320720de1":{"cyrillic":true,"latin":true,"category":"unknown"},"7aef681541fbefaccedf8e93df6f1d3d7eac4214":{"cyrillic":true,"latin":false,"category":"unknown"},"8f617e1edb900297a2cf78673ecf4a2a73c8be50":{"cyrillic":true,"latin":true,"category":"sans"},"99e36cfae07bc529091f68c75225989806ea66ac":{"cyrillic":false,"latin":true,"category":"handwriting"},"98273941ba2e61a677fa28f60f4a6c1956a26a64":{"cyrillic":true,"latin":true,"category":"sans"},"6c11aca7a4ff3e8cc5e186f44cc5061183db7dfe":{"cyrillic":true,"latin":true,"category":"sans"},"fce423e9a2d0831befa879e94f7635bb10b16fb9":{"cyrillic":false,"latin":true,"category":"unknown"},"1368848ba75d699865d9bdaa3af186a0d966ee2a":{"cyrillic":false,"latin":true,"category":"serif"},"75b78fe54b61361c26f9ae5a53842e5c9c533f03":{"cyrillic":false,"latin":true,"category":"sans"},"990f9becef9035bdd0e184d1ccdd9cf8629909d2":{"cyrillic":false,"latin":true,"category":"sans"},"8e31c61d06467a2d1be4ec313b26163ebf2c52d0":{"cyrillic":false,"latin":true,"category":"sans"},"539d062ac3bec4f62c7b7131f56b237d312034e7":{"cyrillic":false,"latin":true,"category":"sans"},"4297ec3d815e7619f464b93acda21c113794da35":{"cyrillic":false,"latin":true,"category":"sans"},"1a6be3f76913b7e50bd4f829a2e913de629b10cf":{"cyrillic":false,"latin":true,"category":"sans"},"d5af3d760f66df46c4ff58f9905eb46b59e4d9c7":{"cyrillic":false,"latin":true,"category":"sans"},"f5fad374a6d09437beca4b70169c11893510efdf":{"cyrillic":false,"latin":true,"category":"sans"},"0f0140d2300392c8b329ac19078e36d56b0dc252":{"cyrillic":false,"latin":true,"category":"sans"},"8844d9626ad3d465083f7ac991fdb1f12452b32e":{"cyrillic":false,"latin":true,"category":"sans"},"c9633e3f1cee35e4763fa631e2b9e8db067579b6":{"cyrillic":false,"latin":true,"category":"unknown"},"894813459b65145b0dc38ee8a88bff2395a85930":{"cyrillic":false,"latin":true,"category":"serif"},"150a4822aa447c963c460905f7f7fd1119442c83":{"cyrillic":false,"latin":true,"category":"serif"},"a72e24a135cac2fdb276a3319f90c3deecd03650":{"cyrillic":false,"latin":true,"category":"serif"},"7ec40281b1c579574da0190bf0a412eeef99f390":{"cyrillic":false,"latin":true,"category":"serif"},"509954b0878acb15c91502298505a7a730aad115":{"cyrillic":false,"latin":true,"category":"handwriting"},"b082806abfbea665ed81dfbcac358fcc544e65f8":{"cyrillic":false,"latin":true,"category":"sans"},"18746cd5a036e1308afe7b4b2f08cf571171daf5":{"cyrillic":false,"latin":true,"category":"sans"},"8f2d646718b2938b145d63d5ed45e073eab9de63":{"cyrillic":false,"latin":true,"category":"sans"},"0410ad38827bd0da6e1d7d2f9b49ee4da2212f62":{"cyrillic":false,"latin":true,"category":"sans"},"4b13a0a11f00ec31db9d9c14d365bbb59461ff93":{"cyrillic":false,"latin":true,"category":"sans"},"9cac1ad3b2e3f65bd58ce707a5d66cf50bb46ad9":{"cyrillic":false,"latin":true,"category":"sans"},"a65516c2eb35585e2763c86d04ef7a8808ba748f":{"cyrillic":false,"latin":true,"category":"sans"},"16bb04a6caa561304c59775cb88becc4bd104b03":{"cyrillic":false,"latin":true,"category":"sans"},"3f0e648156c22f7d483b3f0dc4607ca4ddcf92ad":{"cyrillic":true,"latin":true,"category":"sans"},"b87a1f01408cd5f4190a990123f9c80e4422ac54":{"cyrillic":true,"latin":true,"category":"unknown"},"b25361ca1bf1692db9a10a32ea206f445a0b68c0":{"cyrillic":false,"latin":false,"category":"unknown"},"944d4a94c9cd83101c94005f211347e63c77fc40":{"cyrillic":false,"latin":true,"category":"serif"},"8d1510b5b374bc691caa2bcd9daf8add3e5337fa":{"cyrillic":false,"latin":true,"category":"serif"},"17188bfef28517dc103c4902e953f024c0f6bd70":{"cyrillic":false,"latin":true,"category":"serif"},"25738434abce43c1c8e8b24d618b77a4a712bc24":{"cyrillic":false,"latin":true,"category":"serif"},"1f4fafa986c8f72055328eed81d0578e54d8b961":{"cyrillic":false,"latin":true,"category":"handwriting"},"3ad7d6528bbf030f2e83831ec2b2c88497fbf90d":{"cyrillic":true,"latin":true,"category":"unknown"},"c806c9e799728fe8f02ec3e9e1dfad12bb1ccd2a":{"cyrillic":false,"latin":true,"category":"sans"},"31bed417e170c24634539e1431d12986cc2bdd17":{"cyrillic":false,"latin":true,"category":"sans"},"5848dea320ca98c8b92cffe9897ad28b01f715bc":{"cyrillic":true,"latin":true,"category":"sans"},"0229acc7a1238fa14fa13712725529117078a399":{"cyrillic":true,"latin":true,"category":"sans"},"fedc5d5dbb15fce182a479768f7bdc3689e0cfa8":{"cyrillic":true,"latin":true,"category":"sans"},"269fdf3e0a1e5a28eafe35b4b36f8441f9c225c9":{"cyrillic":true,"latin":true,"category":"sans"},"7b6685b6f1ed1837f6d9ed764dea5f0523f55e5c":{"cyrillic":true,"latin":true,"category":"sans"},"40b72c801957c260419835f66f5088746e37e782":{"cyrillic":false,"latin":true,"category":"unknown"},"d77b3b17d2383585812644f13190d2ad09b06cdc":{"cyrillic":false,"latin":true,"category":"unknown"},"86cc878881f61c6e5eb1d59de435a843a55fb8c3":{"cyrillic":false,"latin":true,"category":"unknown"},"a720bb88407de19c144f6fcff0e3d2410e6e5e6c":{"cyrillic":false,"latin":true,"category":"unknown"},"99c2c5fda0db62803423dacd55e8adff721b4324":{"cyrillic":false,"latin":true,"category":"unknown"},"5f116fe311b1111f02d0890d056db99e87a15ec6":{"cyrillic":false,"latin":true,"category":"unknown"},"06c46d0c2b7a826c29082ae4f2088303b68e20df":{"cyrillic":false,"latin":true,"category":"unknown"},"f5b1e66b2e15f82cf71fd2142bbc7d7998119f3f":{"cyrillic":false,"latin":true,"category":"unknown"},"80756c2ee59c0051dee213d5f22ba97a0a81ae41":{"cyrillic":false,"latin":true,"category":"unknown"},"68983a84518e0c61b49c47b1bac853aa41647dd4":{"cyrillic":false,"latin":true,"category":"unknown"},"08accb0480e9a9fd59ca089977cc0508074beb83":{"cyrillic":false,"latin":true,"category":"unknown"},"d3ba061a494d9dd7d14b1bfe0d5f83e4a3cad1be":{"cyrillic":false,"latin":true,"category":"unknown"},"3f2af912dd0b2c0f6204bde62344618910acf35d":{"cyrillic":false,"latin":true,"category":"unknown"},"f5fd90807b0adc75d702a813dee3ddc5564cbcc3":{"cyrillic":false,"latin":true,"category":"unknown"},"39433bdb34614ccb9aecf4104976b49149537f56":{"cyrillic":false,"latin":true,"category":"unknown"},"46a79f92ecd1bc76360250c84405867adb3c930e":{"cyrillic":false,"latin":true,"category":"unknown"},"a59ccdbd088b4627a49f00f7b08ac5e483c3889d":{"cyrillic":false,"latin":true,"category":"unknown"},"37a5ed77b2ef2bb2f8cb4e646434c88a293f0691":{"cyrillic":false,"latin":true,"category":"unknown"},"e40f557356b6d7fc40eb222fe440ecca5f5e247c":{"cyrillic":false,"latin":true,"category":"unknown"},"aba057d6d3b9676b1d2dad6f82efb96567f12679":{"cyrillic":false,"latin":true,"category":"unknown"},"b0f88ff4d17beb0bceacb8c066e335091d4dbb53":{"cyrillic":false,"latin":true,"category":"unknown"},"38b0c858ea4e8c340f8713259e8f169000eaaa2b":{"cyrillic":false,"latin":true,"category":"unknown"},"29366fbb68da6986d2b84aa606476272f5aa2251":{"cyrillic":false,"latin":true,"category":"unknown"},"d56b94165dbdd8a6547b2d8b4d45d2500754d812":{"cyrillic":false,"latin":true,"category":"unknown"},"9ea8dcf3fc14c464ad4b7602762cea954116769a":{"cyrillic":false,"latin":true,"category":"unknown"},"2364b6f88f63fb93cff6c6431a5370e4f17900bb":{"cyrillic":false,"latin":true,"category":"unknown"},"888fe82e2b9326e5c492193102b3158d520d57ce":{"cyrillic":false,"latin":true,"category":"unknown"},"0f5eca6866d9b9f9929b6aba48223633f0bff571":{"cyrillic":false,"latin":true,"category":"unknown"},"775195e1818ea619719a984c2f057d8fac1e08d5":{"cyrillic":false,"latin":true,"category":"unknown"},"dff7a155ae4affe3b237db32c08c2b3b2689f8e5":{"cyrillic":false,"latin":true,"category":"unknown"},"69512d493ade2de07e042c48e9b4b2633998bf5f":{"cyrillic":false,"latin":true,"category":"unknown"},"6af08512c875c372cee5cda944a89e79d14daba8":{"cyrillic":false,"latin":true,"category":"unknown"},"aed8daf70aa7a3e5522da1bde52bff695aa0bab7":{"cyrillic":false,"latin":true,"category":"unknown"},"acd50991b1632e6eccff1b7ac90543cd14ecfc10":{"cyrillic":false,"latin":true,"category":"unknown"},"5a0b773ecfa6f2189f6ac7ac7ba710ecb69d7c80":{"cyrillic":false,"latin":true,"category":"unknown"},"fb49ff278c30dab6934572d32a8bb6d05bdfad94":{"cyrillic":false,"latin":true,"category":"unknown"},"7212717f99955fb901b0d40ba1368de6061814c2":{"cyrillic":false,"latin":true,"category":"unknown"},"45bd346ee59ba5d79ac0019a38557f90daa2c40a":{"cyrillic":false,"latin":true,"category":"unknown"},"5b6c8ac1f93588b27f8d6e165ca63cbb2b43fb41":{"cyrillic":false,"latin":true,"category":"unknown"},"3cf61bf8c470ae5edbd6b701483ec0ee1adcf3f8":{"cyrillic":false,"latin":true,"category":"unknown"},"e25aca0788745729ee1fd719474f4ecfbf9f1c91":{"cyrillic":false,"latin":true,"category":"unknown"},"6a74bbb670f923c99fc70e6a35cc069fa219681f":{"cyrillic":false,"latin":true,"category":"unknown"},"c7e1af094cb3555183c0fd082410f0e9aa50e2e7":{"cyrillic":false,"latin":true,"category":"unknown"},"1024219feb172742dbc505a19d4f670ef64c5671":{"cyrillic":false,"latin":true,"category":"unknown"},"d36b17a7148831f3438b9e8a6c2b71c03f811d41":{"cyrillic":false,"latin":true,"category":"unknown"},"9f9cde81dc064af830b1f73eeab467e2092d14d3":{"cyrillic":false,"latin":true,"category":"unknown"},"0ea743faebf364a2dea32281806e828906f88546":{"cyrillic":false,"latin":true,"category":"unknown"},"3874912543e492f8520679f1f92b50094b034177":{"cyrillic":false,"latin":true,"category":"unknown"},"83349bd6b8e8c1bd53da84968ae6212b64d7147a":{"cyrillic":false,"latin":true,"category":"unknown"},"c3ac562cc9cbcea7dc29db42762f7a11bc5b46fb":{"cyrillic":false,"latin":true,"category":"unknown"},"f77951cb34bbda42efc62acb8d618a942af4f96f":{"cyrillic":false,"latin":true,"category":"unknown"},"b0f4dc5f0ea6b3a4a555dede6ae47958080993e2":{"cyrillic":false,"latin":true,"category":"unknown"},"139c2dd8d1a399cd24fa6b0a6a64b44bdc32ecbe":{"cyrillic":false,"latin":true,"category":"unknown"},"5d7842a490771bd613021f1057c229dbfe9ed640":{"cyrillic":false,"latin":true,"category":"unknown"},"82df41dde3844b017ad1dfbb62619e468043f8ee":{"cyrillic":false,"latin":true,"category":"unknown"},"7705568d2a8622869bd25d2556aefbc12f835b45":{"cyrillic":false,"latin":true,"category":"unknown"},"4e75903c0183d5aa394cdbad3dd499b696933b06":{"cyrillic":false,"latin":true,"category":"unknown"},"456b873b4acfc83c26269fde6fbb2816cb45da7f":{"cyrillic":false,"latin":true,"category":"unknown"},"c04609ab074249828453c61db35b9bcb858d2a18":{"cyrillic":false,"latin":true,"category":"unknown"},"2ff7022e18393389ad6980d29d4eae1da0d25384":{"cyrillic":false,"latin":true,"category":"unknown"},"c38351384633ea83a66b6bb39f12aad8aed69948":{"cyrillic":false,"latin":true,"category":"unknown"},"9d05ee64d6662a0199378debbed539805c1bb4ee":{"cyrillic":false,"latin":true,"category":"unknown"},"ca25b01cfcac56e78ee0f45d70c27d125c2e1274":{"cyrillic":false,"latin":true,"category":"unknown"},"1be3d56f5ee45147f304a87346d79de438b687a7":{"cyrillic":false,"latin":true,"category":"unknown"},"927fc43fdab309b07fca3d097ab499ad973f17ef":{"cyrillic":false,"latin":true,"category":"unknown"},"4f69989798a77a00b11774bd6c83e2ea08aa6421":{"cyrillic":false,"latin":true,"category":"unknown"},"2f826baa6e829e7de32e2429b946639e2d05b76c":{"cyrillic":false,"latin":true,"category":"unknown"},"26094e7f1be064ebd60e83b1b56244f4ade58f96":{"cyrillic":false,"latin":true,"category":"unknown"},"2de3cacf8f861b418332c006ac009a90d0ef31cc":{"cyrillic":false,"latin":true,"category":"unknown"},"c1dc00699839d3b67637549343cbbe1a55778c91":{"cyrillic":false,"latin":true,"category":"unknown"},"893f8727df77f455342e4cc0a4252447b3c6f8a1":{"cyrillic":false,"latin":true,"category":"unknown"},"a4d05e959ff2812219c7b59622b01e3d983a57ab":{"cyrillic":false,"latin":true,"category":"unknown"},"6730820baae306733cb0497618b856903dd3c420":{"cyrillic":false,"latin":true,"category":"unknown"},"d7d6f53f67a761f1cdb591318da7cc646bc7b1bf":{"cyrillic":true,"latin":true,"category":"unknown"},"e538972b55c68194942f7b66bc9aaad409213f40":{"cyrillic":false,"latin":true,"category":"unknown"},"90eca10ec02b544810eee54c672595937ddc4342":{"cyrillic":false,"latin":true,"category":"unknown"},"502c7d8821a30c6dc58a95abc7808cc8d104851a":{"cyrillic":false,"latin":true,"category":"unknown"},"9a1d078bed499df170db299c5cd6c1b876cc73c4":{"cyrillic":false,"latin":true,"category":"unknown"},"a81063bff4387b3f87e185ea84c1ebacac97f02b":{"cyrillic":false,"latin":true,"category":"sans"},"df981fcee8b5a075d0b59449b7670146a34a203a":{"cyrillic":false,"latin":true,"category":"sans"},"0b0321e75bb80bc8bd97aadfe354ffd05c42a5f4":{"cyrillic":false,"latin":true,"category":"sans"},"88aafe3ef3c5916b4fc3031274afb3aab5b4a32a":{"cyrillic":false,"latin":true,"category":"sans"},"8eab458b6d4c6488930169c0abcd1641620db7e4":{"cyrillic":false,"latin":true,"category":"monospace"},"41ff321dbe8b8304e7926e841c9e67dcd8320645":{"cyrillic":false,"latin":true,"category":"monospace"},"41e5c923e4237a00154db521bfb61d7669e9fc45":{"cyrillic":false,"latin":true,"category":"monospace"},"0fb93306700782cddcc9695c05dd84bc9eee18b4":{"cyrillic":false,"latin":true,"category":"monospace"},"a224b73d8ffc7b0c74eed0973018dcae98b078a8":{"cyrillic":false,"latin":true,"category":"unknown"},"f55552aa59c154cf5e598b286152732d83dc2660":{"cyrillic":false,"latin":true,"category":"handwriting"},"5fcac34b8824a6677b77f1c52de7c8fd992d2971":{"cyrillic":false,"latin":true,"category":"handwriting"},"10ccbf84ed1b342f4b20b52ee547cd04acb35d11":{"cyrillic":true,"latin":true,"category":"monospace"},"b2cda294d0ba77ebd05aafc4c11856ff476297a2":{"cyrillic":true,"latin":true,"category":"monospace"},"2e5ec9b4760be443ce11c97a80aefafe812f0266":{"cyrillic":true,"latin":true,"category":"unknown"},"5a363de7be71eb903d1e0a37aa0fb4ae04197788":{"cyrillic":false,"latin":true,"category":"unknown"},"7bb05f15c93018d3269283d9b7542247909ab9ea":{"cyrillic":false,"latin":true,"category":"unknown"},"1e4ca57db5edbf30a01b97404888bdd2cbfb6225":{"cyrillic":false,"latin":true,"category":"unknown"},"efd7773c53a60e302dc1d7b169209b0dc4958be5":{"cyrillic":true,"latin":true,"category":"unknown"},"6ec9bc61e4339d033d554992c2420d157d7e4e76":{"cyrillic":false,"latin":true,"category":"sans"},"f4c7be0ca1263db6cc4e3519cf6a9145cb073fb1":{"cyrillic":true,"latin":true,"category":"sans"},"548b2b9697e8d1ec0283d7a4d5579dee33a8564a":{"cyrillic":false,"latin":true,"category":"handwriting"},"912384a91c2dc1936b3850d4f1d2ff941bd4a252":{"cyrillic":false,"latin":true,"category":"handwriting"},"95a88139473ffb44b7d4bd2ca74bd04d282b40f4":{"cyrillic":true,"latin":true,"category":"sans"},"5b3c531e73020dcbb50c1f79a0780b4046239046":{"cyrillic":true,"latin":true,"category":"sans"},"a786d6ff9f5707bc6cc946cf911b106a004142b5":{"cyrillic":true,"latin":true,"category":"sans"},"6c0c2306ebe35cb9286368ff985e6dda49526283":{"cyrillic":true,"latin":true,"category":"sans"},"4f02060b0e1a1a89f011f2c4487fa3c10f0a3af2":{"cyrillic":true,"latin":true,"category":"sans"},"6950ee2fd449d2ceb65ff8d347c4c77b0155fbfd":{"cyrillic":true,"latin":true,"category":"sans"},"bf50f85f9231367519eedf295359741e1e98026c":{"cyrillic":false,"latin":true,"category":"unknown"},"30d6eed7ccc3175fcf7d783d7eb42776b3cd3ec3":{"cyrillic":true,"latin":true,"category":"unknown"},"e752dc55570a8309ea62d8fef615f2c953bd38ee":{"cyrillic":true,"latin":true,"category":"unknown"},"8f755b92667853305e5311d6234e4e1a3426e076":{"cyrillic":true,"latin":true,"category":"unknown"},"6ee99b706390b5dc8e94c532afa1fd30f8759413":{"cyrillic":true,"latin":true,"category":"unknown"},"c4d3ff58a140ed4458e424656f58240d86a3225c":{"cyrillic":true,"latin":true,"category":"unknown"},"3b3a23a3d9258ad1aa791f201df3cca4ddd9467f":{"cyrillic":true,"latin":true,"category":"unknown"},"96e09472e09c9fa01620c79bb2225818f2254373":{"cyrillic":true,"latin":true,"category":"unknown"},"419eef9e1b14c3a2a327a89c2de68a0ed14d660f":{"cyrillic":false,"latin":true,"category":"unknown"},"6d0c837df05ab258ff7449622625f82280682611":{"cyrillic":false,"latin":false,"category":"unknown"},"f47ddd78c3bbc075b137a987d551d449cb8b7976":{"cyrillic":false,"latin":false,"category":"unknown"},"e001144ee4ab987b3106a47054f0dcaec9042c8c":{"cyrillic":false,"latin":true,"category":"handwriting"},"b3101523cc3f9603947615ffaef6e6ff90acc2a2":{"cyrillic":true,"latin":true,"category":"unknown"},"244f91935149c4b427501140c3f660f9bc1c5979":{"cyrillic":true,"latin":true,"category":"unknown"},"14d90369952e1d05ed0c617deb7c11c0ff4b39d6":{"cyrillic":true,"latin":true,"category":"sans"},"d47990d7b8dae473866ca30d16a9bd03b7b42d81":{"cyrillic":false,"latin":true,"category":"unknown"},"2680c17db693c2ea9ea778b2af99f0016e6f65e5":{"cyrillic":false,"latin":true,"category":"unknown"},"4c68da229884ff5f04266ebe270335b074df86c2":{"cyrillic":false,"latin":true,"category":"serif"},"3abc3dd92e73dcb5de5ec9ec8ba643157feff99b":{"cyrillic":false,"latin":true,"category":"serif"},"f63addf99ddaa1a900c84fa8a179e3df7ed57719":{"cyrillic":false,"latin":true,"category":"unknown"},"f3fe0b9bec1b4a660693c44cae7586b90ba870a7":{"cyrillic":false,"latin":true,"category":"unknown"},"2e338db580173db8a9bd062f081ef76821addfd0":{"cyrillic":false,"latin":true,"category":"unknown"},"a10fe8d67babc15ed2ccc242e320d252c1329b6e":{"cyrillic":false,"latin":true,"category":"unknown"},"6880b6054e7de89b72f3e05ae9ac024acc134b58":{"cyrillic":false,"latin":true,"category":"unknown"},"be0f37724c030161d2c39e6f6dae51b91c828da8":{"cyrillic":false,"latin":true,"category":"unknown"},"b90f8f458b7a74474ec6827dbd27ec4d19b09368":{"cyrillic":false,"latin":true,"category":"unknown"},"9e8f970ec72945548919c31258779ce037e90c54":{"cyrillic":false,"latin":true,"category":"unknown"},"dd17b87de42f854453277d8c3207f8df8332550f":{"cyrillic":true,"latin":true,"category":"unknown"},"67470320e6f813ad9d2ba9a1e138601d92104e2a":{"cyrillic":true,"latin":true,"category":"unknown"},"6fa9cdf8aa21e25217f1a5b008c48699d500a993":{"cyrillic":true,"latin":true,"category":"unknown"},"d5d645e310e44a39e5f886f617eeed708cd2242b":{"cyrillic":true,"latin":true,"category":"sans"},"07b3dbdfd940986456e1d7e7e7602402df6d943e":{"cyrillic":true,"latin":true,"category":"sans"},"40f9d705a623e43aa364c44b5b3f6fa1fcb55de5":{"cyrillic":false,"latin":true,"category":"sans"},"f748bf3ce4dce507e3b962dde4c18fef93dff5e2":{"cyrillic":true,"latin":true,"category":"sans"},"290402768a2084b81bcb1c8bc12ae6d0abc901bf":{"cyrillic":true,"latin":true,"category":"sans"},"4fe64bf04ec9e2d2bf094a49f314c27eb12bdaf8":{"cyrillic":true,"latin":true,"category":"sans"},"92618c449d7a5f62f27e6c2f35c93cd755992ffe":{"cyrillic":true,"latin":true,"category":"sans"},"49f50d390cde029899f3c7db9fbda6b9f6533ac2":{"cyrillic":true,"latin":true,"category":"sans"},"d76a4612f8109108f7076d9673568d8cc3fcaa1d":{"cyrillic":true,"latin":true,"category":"sans"},"c76ab5ddb0990f318d66bdedc93151a49887bc9d":{"cyrillic":true,"latin":true,"category":"unknown"},"336a0c9f6dd9807d8a9d9ba84bca80721112cf88":{"cyrillic":false,"latin":true,"category":"unknown"},"cf5bd6eaef4cdeabd0036cb0002bd192c3a64e42":{"cyrillic":true,"latin":true,"category":"handwriting"},"0367f5660b805003102b7d209657daa4522a14a2":{"cyrillic":false,"latin":true,"category":"sans"},"568528f4326bcda048c243cf6a389fcf5957c714":{"cyrillic":false,"latin":true,"category":"sans"},"edb20978c7ed67cf80a682b4583377b25a727b63":{"cyrillic":false,"latin":true,"category":"sans"},"2e64cd43e3d2f65ecdf6dee519cd41fd1fb821f2":{"cyrillic":false,"latin":true,"category":"sans"},"17c8959b3aab31ee69f9dc46e2bcaed0bb80f46b":{"cyrillic":false,"latin":true,"category":"serif"},"5fadfbb313056875dd74534dbd0a51989f3020a9":{"cyrillic":false,"latin":true,"category":"unknown"},"f7ebc9f82249a385c4ef45fead0193e7da57f2f7":{"cyrillic":false,"latin":true,"category":"handwriting"},"c76b1276107e49392e713213843071669b7e0ea5":{"cyrillic":false,"latin":true,"category":"handwriting"},"553a4fa9fa60b713fc817eef39c05d0c111af287":{"cyrillic":true,"latin":true,"category":"unknown"},"9603e0a6ee20f609697f30fe9f71a56080a98286":{"cyrillic":true,"latin":true,"category":"unknown"},"74989b51a72847690cb0beac13bf7f93fd7a44bd":{"cyrillic":true,"latin":true,"category":"unknown"},"807eb5a65b38b57e6a99f729dad5b4ef658aa06b":{"cyrillic":true,"latin":true,"category":"unknown"},"1033ec80ac0948f419425d58513b02d089b57818":{"cyrillic":true,"latin":true,"category":"unknown"},"72c76e0cf28d6269f398d7a3c6f3344a5c57b3f4":{"cyrillic":true,"latin":true,"category":"unknown"},"2c40df59a1864348761caf40a3845e4f49f1b918":{"cyrillic":true,"latin":true,"category":"unknown"},"859d22475194bdf2afd81e5621a7838753e6380f":{"cyrillic":true,"latin":true,"category":"unknown"},"bd3640f469599a81ffbddb54db42b21d5a1d08a5":{"cyrillic":true,"latin":true,"category":"unknown"},"e46d5406a97f27d50750edb7c47c5e75868330c2":{"cyrillic":true,"latin":true,"category":"unknown"},"bbb288f91b1bc88d5f1dc06950f55ea18933cb15":{"cyrillic":true,"latin":true,"category":"unknown"},"3c11f7f267bd2d4490c388e8f247269d6a65180f":{"cyrillic":true,"latin":true,"category":"unknown"},"704ec9a0e0787f24b612aaf51b1132cae8482273":{"cyrillic":true,"latin":true,"category":"unknown"},"de13160571240b2b7dc74b23a2f81290c6c10bef":{"cyrillic":true,"latin":true,"category":"unknown"},"2426a02f49d0c36af1293dbaf8c6da612de08475":{"cyrillic":true,"latin":true,"category":"unknown"},"c2318b890ac8e516492e3fb18aad105ad818316c":{"cyrillic":true,"latin":true,"category":"unknown"},"642fc5d46add6cdc97083d832c4801dcef9c28d2":{"cyrillic":true,"latin":true,"category":"unknown"},"971c5dfebd101292aab967fdfea601e59337ce76":{"cyrillic":true,"latin":true,"category":"unknown"},"47c618436e064a781cee9d34d2b7f1c3f82987d5":{"cyrillic":true,"latin":true,"category":"unknown"},"3c12a67ed5c3d913fc02f9f54dc5021c30313183":{"cyrillic":true,"latin":true,"category":"unknown"},"d189bc810f37edbc308becdbbac9603d614678d8":{"cyrillic":true,"latin":true,"category":"unknown"},"cfb5b0580c12bcde0e6ca8814dae39cddbfc7f72":{"cyrillic":true,"latin":true,"category":"unknown"},"295ea953079e6a64b3954e3b7c543eb5d4810df4":{"cyrillic":true,"latin":true,"category":"unknown"},"e0f36eaf5d0bfe7a4f5263f0ce1590b1ef19a523":{"cyrillic":true,"latin":true,"category":"unknown"},"43b2211d944cab6dc2682c0971549022be134163":{"cyrillic":true,"latin":true,"category":"unknown"},"563bc832ae9d09ff16749761cc1e992efcf404ca":{"cyrillic":true,"latin":true,"category":"unknown"},"e7a43090ea7447bff3b8a20927b7a744a4a0c2bb":{"cyrillic":true,"latin":true,"category":"unknown"},"1bf2dc8f5f4265a1587ad0db7fa2ae32a46f8a2c":{"cyrillic":true,"latin":true,"category":"unknown"},"8c06bb72dc2c68a57375fb1e3a2e8231abfc9e0f":{"cyrillic":true,"latin":true,"category":"unknown"},"4c329ba09c89a7ca4fc41a72dd358757872d4797":{"cyrillic":true,"latin":true,"category":"unknown"},"d6661d73afaafc69467f92a45e80ff7c5f7e434b":{"cyrillic":true,"latin":true,"category":"unknown"},"e2afcf9aa2940015a45ec6d5984772164c6bb345":{"cyrillic":true,"latin":true,"category":"unknown"},"6531fc9fe5e37cda1579872ed27461af70e15340":{"cyrillic":true,"latin":true,"category":"unknown"},"c1fb0fef062de4bf87ddeabde923d10f4055d38c":{"cyrillic":true,"latin":true,"category":"unknown"},"58d8380db0fd225bf08ec7c6ba885814e39b4dc3":{"cyrillic":true,"latin":true,"category":"unknown"},"444db1799d021f94ed52aaa85944e7eecdff46f5":{"cyrillic":true,"latin":true,"category":"unknown"},"dd663ba793a8add15218d9b469a1137c101b7420":{"cyrillic":true,"latin":true,"category":"unknown"},"6571f85a59dc0af6f9264f4cecb26ff6c5b2d7f8":{"cyrillic":true,"latin":true,"category":"unknown"},"c996840cfcb83f35c94b39576e445afc0a2091d1":{"cyrillic":true,"latin":true,"category":"unknown"},"c21cd9a9d59045893bba8c0201a020228be59ec5":{"cyrillic":true,"latin":true,"category":"unknown"},"34d1cddfe8918ae0f17ab66864b51613ef85a1c6":{"cyrillic":true,"latin":true,"category":"unknown"},"eeb2fcdda877471d73039916a4c2ac2ba47a66c5":{"cyrillic":true,"latin":true,"category":"unknown"},"c54dac75b8dd1016adf9d141004bec0e608ac9c5":{"cyrillic":true,"latin":true,"category":"unknown"},"d2f6d769da0d5473ee753093850159e78d6a2e63":{"cyrillic":true,"latin":true,"category":"unknown"},"1a3f83408495bc6663fd3ca6198fe520d28e1757":{"cyrillic":true,"latin":true,"category":"unknown"},"e1670ef34e8999c770dc77fe6f6fd5a33e8e70c1":{"cyrillic":true,"latin":true,"category":"unknown"},"5c3e9ac776df3e6bac0edbf7e518625e34c18214":{"cyrillic":true,"latin":true,"category":"unknown"},"3de1871996942f4624be55d236be2779da5b930e":{"cyrillic":true,"latin":true,"category":"unknown"},"aa9f322eecc68388f947def314a18213c08bc6b8":{"cyrillic":true,"latin":true,"category":"unknown"},"8b47da5f511d0ab8f1943451a711eb980ef0246c":{"cyrillic":true,"latin":true,"category":"unknown"},"106a1143c49fab2579a45e8432fa9bf55c84410b":{"cyrillic":true,"latin":true,"category":"unknown"},"083817321ca923df8d1ccaa74d3341e5505c4e5a":{"cyrillic":true,"latin":true,"category":"unknown"},"1739136bccec774d50701374f567b7d7351ed8e3":{"cyrillic":true,"latin":true,"category":"unknown"},"7cacf90bc5eb44c3fe61ef7ae16fd1db21c4f6e0":{"cyrillic":true,"latin":true,"category":"handwriting"},"6e66880ab84bd6132a91923209ee81d52b043834":{"cyrillic":true,"latin":true,"category":"handwriting"},"3f3c6fa0f67ad1590f2591c0b93640eebb6478f0":{"cyrillic":true,"latin":true,"category":"handwriting"},"d07d96efefbbf4db3bfb44a6fe8820e8341cffb6":{"cyrillic":true,"latin":true,"category":"handwriting"},"c95e3205600acade8549720ea37a54d251b41acf":{"cyrillic":true,"latin":true,"category":"unknown"},"77fb73efda0ca0e31a7b3e167c385d6068fea1ce":{"cyrillic":true,"latin":true,"category":"unknown"},"8b7ff94534c890c75166e0c5b5caf74f7b38be2c":{"cyrillic":true,"latin":true,"category":"unknown"},"137ad16ad9c397d11a856a249715bfc7b61b643e":{"cyrillic":true,"latin":true,"category":"unknown"},"34030b66167b57d2e8043ae7cdaa4f9e6628c7ef":{"cyrillic":true,"latin":true,"category":"unknown"},"0658a0f84b1c837bfed88666998e87381ec9324b":{"cyrillic":true,"latin":true,"category":"unknown"},"058e3d15b588c7b86a880dd1206e37cf723c6ec3":{"cyrillic":true,"latin":true,"category":"unknown"},"bf3f53699a64008e7351ab08dc1e891309b622bd":{"cyrillic":true,"latin":true,"category":"unknown"},"10682c5bbf8ac01ec57507ec7421cfe44190e0b1":{"cyrillic":true,"latin":true,"category":"unknown"},"330bb6820b9375f2a71f0870131ad5717022f8b0":{"cyrillic":true,"latin":true,"category":"unknown"},"f3ccfe9df3739965a8bc46be54ad73a47e3362f8":{"cyrillic":true,"latin":true,"category":"unknown"},"544b94f61038116159f58d250fc6070438145b02":{"cyrillic":true,"latin":true,"category":"unknown"},"b1b82883455bcb4c15f2206a1167f954475eb240":{"cyrillic":true,"latin":true,"category":"unknown"},"d519a0a6e184e415bb86573a45086faaddbc97b1":{"cyrillic":true,"latin":true,"category":"unknown"},"d21cc43799e6e7cc6d2064ccb727777cb8bf0d32":{"cyrillic":true,"latin":true,"category":"unknown"},"2456097d1082f7fa983f0c02cd069b2b7028cd05":{"cyrillic":true,"latin":true,"category":"unknown"},"997f6c1366647b62ab27adee1cc00bf66645bdc1":{"cyrillic":true,"latin":true,"category":"unknown"},"f219d2b146bee09e54e7b25f1f2e74319fb5a3ef":{"cyrillic":true,"latin":true,"category":"unknown"},"203b5b7f84ef3f83bde31fdfd1dc962a2dfaa6be":{"cyrillic":true,"latin":true,"category":"unknown"},"d1d4a659d1b997c8ab55b4512e9d3fe6e01143ee":{"cyrillic":true,"latin":true,"category":"unknown"},"b5878bd7476fc03b4b515f1c4fcc496dfe68031e":{"cyrillic":true,"latin":true,"category":"unknown"},"d5ab84bf4fdb47940531ea8a47dcce2a0fcdf3cf":{"cyrillic":true,"latin":true,"category":"unknown"},"9daac4a6072843e3e1dca5da1b7968f942ec1f11":{"cyrillic":true,"latin":true,"category":"unknown"},"113630170f26eb41d279b7678e12cdee3dc0a870":{"cyrillic":true,"latin":true,"category":"unknown"},"bdff92b966fe40c0723059473c166a08b4efed82":{"cyrillic":true,"latin":true,"category":"unknown"},"018b5ac4deb3c0be7e65011ecc3f2ddf286d69ca":{"cyrillic":true,"latin":true,"category":"unknown"},"113d40e74fc956f2f5ff216f58fe14c8b0a98baa":{"cyrillic":true,"latin":true,"category":"unknown"},"14196cef084d6ad57795c3173b4e3b6bb04209cc":{"cyrillic":true,"latin":true,"category":"unknown"},"72fcaeb5945993cd0df6a4057c0f1791b9419895":{"cyrillic":true,"latin":true,"category":"unknown"},"500c43d0481230a05d6f06ebd48e5c5297dfe0f2":{"cyrillic":true,"latin":true,"category":"unknown"},"5f4734e5f08eb5e5335f5d0b04b5dd782c310158":{"cyrillic":true,"latin":true,"category":"unknown"},"85e8784a0a5742e137764d41d3e3f932775e87d4":{"cyrillic":true,"latin":true,"category":"unknown"},"290918199c6f750553f6578849550bed9acf0df0":{"cyrillic":true,"latin":true,"category":"unknown"},"a22cfe9be8b61de78d112f65f0342094942f7707":{"cyrillic":true,"latin":true,"category":"unknown"},"1841f38dcd47eb59aa1d8f8c6fbc45327a22012e":{"cyrillic":true,"latin":true,"category":"unknown"},"c960e5afad5dc34f4b8a3d8772853f3ab422f6f7":{"cyrillic":true,"latin":true,"category":"decorative"},"19c8498b2f0a91a63f2ae31420ad2cb4f2153d9c":{"cyrillic":true,"latin":false,"category":"unknown"},"5b81720d8b9d62e74b6cb35f34b3c1643d6dbd4e":{"cyrillic":true,"latin":true,"category":"handwriting"},"f4b9c11ab21901af7a0d720cc81e6cc6a6029d0e":{"cyrillic":false,"latin":true,"category":"unknown"},"f22df1c018be91f7a73d9dfb24230e183348b46a":{"cyrillic":false,"latin":true,"category":"unknown"},"fca5d224d2f9c6a411dafe1483d88aa77f59acec":{"cyrillic":false,"latin":true,"category":"serif"},"a903b225e313188716fc1fc2a4439a27e95290f7":{"cyrillic":false,"latin":true,"category":"serif"},"d199afbc42a2837a5c423816ccac9b3a55c6eef6":{"cyrillic":false,"latin":true,"category":"unknown"},"485287bb7bf1d519edf616c5465ff12b6f736683":{"cyrillic":true,"latin":true,"category":"unknown"},"2f273929158aeecae1be316383ec5e865f099948":{"cyrillic":false,"latin":true,"category":"handwriting"},"71029742671c45768feff1116279b802c8e7d4b3":{"cyrillic":false,"latin":true,"category":"handwriting"},"a6eef9846928214ca99a7e61d8a13ef353eeeb2c":{"cyrillic":true,"latin":true,"category":"handwriting"},"247dc8fa32830c27d9436d078725d8e134fd1c42":{"cyrillic":false,"latin":false,"category":"symbol"},"1095b58f00a4b4430addb11ab62edf804558ffb8":{"cyrillic":true,"latin":true,"category":"unknown"},"bb8efa18e2a93fae62c396a0596a0397ecad405a":{"cyrillic":true,"latin":true,"category":"unknown"},"c8d96735eee6c6ac0ac4624d3b0012931aa94803":{"cyrillic":true,"latin":true,"category":"unknown"},"c32ff9424bd8744546f765358ae89db7404a2deb":{"cyrillic":true,"latin":true,"category":"unknown"},"4c7417bb98975d7d8f8ce3ff8e2bb6f8b135df7e":{"cyrillic":true,"latin":true,"category":"unknown"},"a50d6030875a0755931b9fc557afcf7cf2c06224":{"cyrillic":true,"latin":true,"category":"unknown"},"258cc93c296898498fea90d96d69b8f0e95187ff":{"cyrillic":true,"latin":true,"category":"unknown"},"95d9655ebc632f5f18de3d0034031d9d99aceac6":{"cyrillic":true,"latin":true,"category":"unknown"},"f9ccbe68dc036da6ec84cd9ef0db49fe3a971710":{"cyrillic":true,"latin":true,"category":"unknown"},"7edea01e0545f2de9d28063e93e67c13d1efcae7":{"cyrillic":true,"latin":true,"category":"unknown"},"173e7671f8bd03c5e4063ff92fd5c3f274b34716":{"cyrillic":true,"latin":true,"category":"unknown"},"efd171dc6be874d4788cbcc737be2b0f80cfcbfe":{"cyrillic":true,"latin":true,"category":"unknown"},"20ff034f751fc2e605d6c6d1acee4cdb43860950":{"cyrillic":true,"latin":true,"category":"unknown"},"38f847cd566ccc0c0fb0b57ce9fd1fd08b937a71":{"cyrillic":false,"latin":true,"category":"handwriting"},"291c4252faec6557a4cdc5780446831b81fa0bce":{"cyrillic":false,"latin":true,"category":"handwriting"},"0663431b51a76cc879b39c838cf0437c7cfada10":{"cyrillic":true,"latin":true,"category":"sans"},"448269733660d20efc96175569fcb38a7b4c61d1":{"cyrillic":true,"latin":true,"category":"unknown"},"c8aff010bf32909ee5781403f6b4d961b8aaf71e":{"cyrillic":false,"latin":true,"category":"unknown"},"b1948d11af900e93509b11640891ad264a41d32b":{"cyrillic":false,"latin":true,"category":"unknown"},"9985fad0a103d62807d6c1c5c4c808f0c9072a2f":{"cyrillic":false,"latin":true,"category":"unknown"},"dce9e0facf8870ede8e93dd65fe9d6ab60d4b251":{"cyrillic":false,"latin":true,"category":"unknown"},"fa3bce7ae51021983e534eeb556987ab330c775e":{"cyrillic":false,"latin":true,"category":"unknown"},"1d32d04c5c4ca44f47cc150caa488dd24304231d":{"cyrillic":false,"latin":true,"category":"unknown"},"926f00be6848e510a0e143512587e8a565c5b936":{"cyrillic":false,"latin":true,"category":"unknown"},"d370682b50cd740b9de0fc9f0bf58ec0bad8de07":{"cyrillic":false,"latin":true,"category":"unknown"},"c151c5624df147fd8a3afa9654d52a48b313386a":{"cyrillic":false,"latin":true,"category":"unknown"},"0ad407ba4acd8d5f49393f9789e2284f8e84ddcc":{"cyrillic":false,"latin":true,"category":"unknown"},"ad4109d52b037069e07cce5e9ee6e27dad6bc8e8":{"cyrillic":false,"latin":true,"category":"unknown"},"adba14ed2550314a3a6f676a1795dd099cf59e3f":{"cyrillic":false,"latin":true,"category":"unknown"},"b1ab25ffb3ab04f13849ed9f4c306ec00554cd61":{"cyrillic":false,"latin":true,"category":"unknown"},"c5c8212f40c53d1a1ca0a034a29a39497e2df6de":{"cyrillic":false,"latin":true,"category":"unknown"},"26862256aa35d3d6983b80d2c6a5388c0101cdb5":{"cyrillic":false,"latin":true,"category":"unknown"},"f7ff6e74d28346d725d3f0a5eb48a0586c1b8212":{"cyrillic":false,"latin":true,"category":"unknown"},"a1be5da5141eb8fc04e837af25a8198b9077225a":{"cyrillic":false,"latin":true,"category":"unknown"},"7d994ffd9d7f04e636e16b5e402ea2a95c47a7bc":{"cyrillic":false,"latin":true,"category":"unknown"},"16806d6ef4394e9fd744a0e0b43df51f23ae7b3c":{"cyrillic":false,"latin":true,"category":"unknown"},"f1509554bf14e5da1c5f90d57bba704ad648211b":{"cyrillic":false,"latin":true,"category":"unknown"},"cb46ead4f7a71dd0982df335258a2ee1443f6e6e":{"cyrillic":false,"latin":true,"category":"unknown"},"d7e424378966b99269a91489298fbf294fba5e8b":{"cyrillic":false,"latin":true,"category":"unknown"},"1662df8061a4bf10cdfe8fe7aabde00e57d96baf":{"cyrillic":false,"latin":true,"category":"unknown"},"a5b8be83ab828f40bd414dd35f0915749f30b492":{"cyrillic":false,"latin":true,"category":"unknown"},"e0a15da2565c27ec03b5e10cb4f485911f878452":{"cyrillic":false,"latin":true,"category":"unknown"},"3efef2d110cb8308f6a3eca7bb0284e1be4299e1":{"cyrillic":false,"latin":true,"category":"unknown"},"748eb1aa62671d0956cae0114048057a52537109":{"cyrillic":false,"latin":true,"category":"unknown"},"5c532b32b4f70e42519e4738c0886b7a56b288be":{"cyrillic":false,"latin":true,"category":"unknown"},"1959a765eed48e1ea1d05efc9b902f37001d99ab":{"cyrillic":false,"latin":true,"category":"unknown"},"8c607ac5865e25ae980f7b03e54e2a125a032e6f":{"cyrillic":false,"latin":true,"category":"unknown"},"4a7b8ed979a095d0c30c389b20f7d3fc703ad3c3":{"cyrillic":false,"latin":true,"category":"unknown"},"f5b346fb687d0e7d336403614b019c613d29769e":{"cyrillic":false,"latin":true,"category":"unknown"},"6ca6c2bd2ec1ac81f591538ce0dd4a9742f8fcb5":{"cyrillic":false,"latin":true,"category":"unknown"},"94b7feeed6ee297f44162bf1bb96eadce9f0532b":{"cyrillic":false,"latin":true,"category":"unknown"},"87ce554820e223d6a42598954d674e2dc69a5ff3":{"cyrillic":false,"latin":true,"category":"unknown"},"f95b5750b65c439cf184dacd365257044996e429":{"cyrillic":false,"latin":true,"category":"unknown"},"8627f1354ff4c154384a90e0c2e42135717ce66d":{"cyrillic":false,"latin":true,"category":"serif"},"3a4dc7e4fbeedae59e805c3f0a8a519344297334":{"cyrillic":false,"latin":true,"category":"serif"},"bdba63ca9408e236a1025167ce19a6e461e5283d":{"cyrillic":false,"latin":true,"category":"serif"},"b3b7840f251f484bb80a4ca3eae397991a889d35":{"cyrillic":false,"latin":true,"category":"sans"},"d7278074adc98119833700f9982d8d2e4382f48f":{"cyrillic":false,"latin":true,"category":"sans"},"87e0fc5e7edf10707bde24c80077fcf79f4eb4b4":{"cyrillic":false,"latin":true,"category":"sans"},"6f020ee2d3926a9ba3d9ebcfdc7223f8b5742c45":{"cyrillic":false,"latin":true,"category":"sans"},"c03c4544b5ee964d4e265afe2fa6712ad173736b":{"cyrillic":false,"latin":true,"category":"sans"},"dd81fd6714040b8fb266fd2cc0c4b17f7f3dda50":{"cyrillic":false,"latin":true,"category":"unknown"},"a6dbadfff00759596ccd560cef5dde278f1ab15c":{"cyrillic":false,"latin":true,"category":"decorative"},"4633ec747599811ae326985718cb208f379d3539":{"cyrillic":false,"latin":true,"category":"decorative"},"b9735498df9fad642f1c9e62674829eb1624c864":{"cyrillic":false,"latin":true,"category":"unknown"},"f3c040dcc8daa8af528720dd56122ede9eabeaed":{"cyrillic":false,"latin":true,"category":"sans"},"8c921ed74e0268cc78ab1cafded375c42c75ebe5":{"cyrillic":false,"latin":true,"category":"sans"},"faddfeb021b75b7f69f2a7e86276b3e3d150f082":{"cyrillic":false,"latin":true,"category":"sans"},"ecdc5074a46cfd967c92522838416f46fe20c4d0":{"cyrillic":false,"latin":true,"category":"sans"},"21a493ccce42431c6fe9a725edc7e1c1c35f4a69":{"cyrillic":false,"latin":true,"category":"sans"},"765622ed0ce0fb42e1d3ad931d45e5e2f5065a08":{"cyrillic":false,"latin":true,"category":"sans"},"abea56b9359a8c2488d967214e5a5701d40cfe3f":{"cyrillic":false,"latin":true,"category":"unknown"},"ea0c911745f33000767b8c8e62589f642d072e08":{"cyrillic":false,"latin":true,"category":"unknown"},"557d4b1aa14a7b8d8d80771e86ec83a7d35e8997":{"cyrillic":true,"latin":true,"category":"unknown"},"7072104d3ce8db3cd4072509310ee18a9f2feafe":{"cyrillic":true,"latin":true,"category":"sans"},"264bb0cf117dc7664f8977d87c42bf11679e9fd6":{"cyrillic":true,"latin":true,"category":"sans"},"6a6920c25f287b536ee87318da88086404943d80":{"cyrillic":true,"latin":true,"category":"sans"},"d7edbbf07f0ee9c93b769eec9f93fd3d1e084703":{"cyrillic":true,"latin":true,"category":"sans"},"f1a3e70cd73f598aab71e83041b5bb2638adb52d":{"cyrillic":true,"latin":true,"category":"serif"},"e79d8d083e1c61af814138490230692a38e95125":{"cyrillic":true,"latin":true,"category":"unknown"},"66ef83385452d0fc951dd8e5b90aa94e44315109":{"cyrillic":false,"latin":true,"category":"sans"},"85475394e43aa39d304aedb388133c54141daca3":{"cyrillic":false,"latin":true,"category":"sans"},"4bfe7d99a35abba1ecd2a0dffc83e614e047e5b6":{"cyrillic":false,"latin":true,"category":"sans"},"5cc988bdf913797d795f64bcb4ea30af576b677a":{"cyrillic":false,"latin":true,"category":"sans"},"a0a2308d53a246f9e8fe5aae36d352dee4b20986":{"cyrillic":true,"latin":true,"category":"unknown"},"70935cc5e4585dfe1326244f66938146a030fe93":{"cyrillic":true,"latin":true,"category":"handwriting"},"6a6821838d752d1cbca30e01e32e0da00bd0ac65":{"cyrillic":false,"latin":true,"category":"sans"},"7b73e14e49ef1a6f5eff41aaea1b4cd44f089e7b":{"cyrillic":false,"latin":true,"category":"sans"},"722e4d6c21df226ea23bb591f4207e9d5b13cee1":{"cyrillic":false,"latin":true,"category":"sans"},"4d6247da4670b280a8914068a3561d4a7c6788e2":{"cyrillic":false,"latin":true,"category":"sans"},"66beb4a2b487d75fd131bca82678df3e4114b72c":{"cyrillic":false,"latin":true,"category":"monospace"},"706ffba18d27529f2f01ad6e0f59a8a287c462ef":{"cyrillic":true,"latin":true,"category":"handwriting"},"a8f126c4cf18b8360068a17753197b5b20533139":{"cyrillic":true,"latin":true,"category":"unknown"},"a0d40f34e442310e9e3619570cf29b93e3f0dffd":{"cyrillic":true,"latin":true,"category":"unknown"},"efe5eeccc6a079e2ea97bd0947b47805a3711955":{"cyrillic":true,"latin":true,"category":"unknown"},"738b9bca51f04d0d5f1ff23b7607e1119b00e34d":{"cyrillic":true,"latin":true,"category":"unknown"},"526e0408438e0658e646c8c699cd107c50b4e101":{"cyrillic":true,"latin":true,"category":"serif"},"0c42e30d574bc34cea4eeda849833fc77f80da15":{"cyrillic":false,"latin":true,"category":"decorative"},"318246c06ccf8c143f3c69bbe317ff3f171f15bf":{"cyrillic":true,"latin":true,"category":"unknown"},"cc0a9a4f87342c7dcb93ece9ba190b9413381a63":{"cyrillic":true,"latin":true,"category":"unknown"},"2ab03b3666584234be6308dec194ef874a5cd25a":{"cyrillic":true,"latin":true,"category":"sans"},"9e3829da367862e5e1a84c5438c2dc83da1e66bf":{"cyrillic":true,"latin":true,"category":"unknown"},"b695bd13e995fd8bc946d663286b8d458cd6acb7":{"cyrillic":false,"latin":true,"category":"handwriting"},"51a55a7b2dfb35c1475604ed1dd1d9abc52186a1":{"cyrillic":false,"latin":true,"category":"unknown"},"aeda1070e1533c14f97963069375ddeb6dab8ae4":{"cyrillic":true,"latin":true,"category":"unknown"},"83190526fbdeb4c005c9551639abe749f53bbe90":{"cyrillic":true,"latin":true,"category":"handwriting"},"f2f7cdc0cfb325df8492c6580f60b1b8043d1ca9":{"cyrillic":false,"latin":false,"category":"sans"},"b50f2f3bf647f2f84b4e732f2b93ad215982def0":{"cyrillic":true,"latin":false,"category":"decorative"},"65ade425f8e945b0f774cef41a0c01a30cae6ac8":{"cyrillic":false,"latin":true,"category":"unknown"},"ba8576b65b2c094929a72b052ebfdb6ae8cef418":{"cyrillic":true,"latin":true,"category":"unknown"},"74148cb2c01a5cc73e37b910dc933359b4e9fb45":{"cyrillic":true,"latin":true,"category":"unknown"},"59cf84fed762ec6d66f76f309f66c39d77d0162d":{"cyrillic":false,"latin":true,"category":"unknown"},"84824b6fd9209cac4c41def05ae4b5352f928d4f":{"cyrillic":false,"latin":false,"category":"sans"},"8a98c6b642618ae689607cf8a9e441e53e9f1024":{"cyrillic":true,"latin":true,"category":"unknown"},"a642fd9248924160d733dc5dd9bc0ca3dfa67ab6":{"cyrillic":true,"latin":true,"category":"unknown"},"ecbcac5c78726a0c4d083d5e5c1b4568b3663a39":{"cyrillic":false,"latin":true,"category":"unknown"},"842e82e099c1245a43505a6eeb7d6b24170e156f":{"cyrillic":true,"latin":true,"category":"unknown"},"39a22f0460bbdffad6692bc5d9704ed4fb1fe0d6":{"cyrillic":true,"latin":true,"category":"unknown"},"9836a920934e7420b53c62bb537a0d5524d1c63c":{"cyrillic":true,"latin":true,"category":"unknown"},"67e68d7ca8a0cb0980d4186cadcb91941a1e1033":{"cyrillic":false,"latin":true,"category":"handwriting"},"ed12210306f54924c928f89074c8c441f6f401f4":{"cyrillic":true,"latin":true,"category":"unknown"},"0153572f79b7782f51a00297ac47304058800562":{"cyrillic":true,"latin":true,"category":"serif"},"a6ca072fbb283f862bedaf90ef2f690a97e58b89":{"cyrillic":true,"latin":true,"category":"unknown"},"7f8acd8b53515e716517e182d711913969ff03a1":{"cyrillic":true,"latin":true,"category":"unknown"},"c54be72889daa4f6843c0be2776652f8edbfa287":{"cyrillic":true,"latin":true,"category":"unknown"},"465586f979a6be52e1ff714d3f5bd6f5c8320705":{"cyrillic":true,"latin":true,"category":"unknown"},"4120b66e8fb395343948dad01a6be1cc0d8689a6":{"cyrillic":true,"latin":true,"category":"unknown"},"76d6bf2755aadc681ab5102438652334357c634f":{"cyrillic":true,"latin":true,"category":"sans"},"f192daffdc757af2bcd41436a22fca005bdda314":{"cyrillic":false,"latin":true,"category":"unknown"},"de7e0f31df8ce5f733b5d7a4d8778e95c57885c7":{"cyrillic":false,"latin":true,"category":"handwriting"},"0112f6a5f51be5b68bf36f4b026e5f55c066c859":{"cyrillic":true,"latin":true,"category":"unknown"},"95dff8d011e71f3ae468ea2e0b68823b46991aed":{"cyrillic":true,"latin":true,"category":"unknown"},"c9dc0e5c1f719c47cf33be9d06c500180cbc41c7":{"cyrillic":true,"latin":true,"category":"unknown"},"57581589ba6eb5024f178ba3705278c2b453abe3":{"cyrillic":true,"latin":true,"category":"unknown"},"05a2ccfd57801a965d211e79c252f9f862af0a2b":{"cyrillic":true,"latin":true,"category":"unknown"},"626bf937892f6193e9b352bd80214e93e56ce737":{"cyrillic":true,"latin":true,"category":"unknown"},"f4c5c74aac92cfdd22644e162e3f0fc4221b8433":{"cyrillic":true,"latin":true,"category":"unknown"},"fd93f2a3441329a19835f833056024a55c32ee9b":{"cyrillic":true,"latin":true,"category":"unknown"},"5218bac145ffee53975474a594277ff4cee1b511":{"cyrillic":true,"latin":true,"category":"unknown"},"949554ff4b83d944ab8d2d1a8760544040b17d4d":{"cyrillic":false,"latin":true,"category":"decorative"},"bf23f9b6b5467dcf4499c5a7381d7b4a5436bb32":{"cyrillic":true,"latin":true,"category":"sans"},"c48ac0f0a15cf4d33edd0a15822bdfb4823e8452":{"cyrillic":true,"latin":true,"category":"sans"},"773c8e32c59c56302927794718bdb3077c2c4158":{"cyrillic":true,"latin":true,"category":"sans"},"c3c1720f2aec8a3c8dd9262ba82a29543b58c5d0":{"cyrillic":true,"latin":true,"category":"sans"},"b2b8009b7774a90fb4a74a787e2820366e35b98c":{"cyrillic":true,"latin":true,"category":"sans"},"de7ecbd4b28c5803b8914665478da629492d7daa":{"cyrillic":true,"latin":true,"category":"sans"},"2cc8f1f372d20bf6200092742ae3e3409ab04f81":{"cyrillic":true,"latin":true,"category":"sans"},"90ee2248a8b604fb2b1843bb43a1dd13351e0d6e":{"cyrillic":true,"latin":true,"category":"sans"},"efccad548992593b1dd205e95f70504f40823b3b":{"cyrillic":true,"latin":true,"category":"sans"},"7cc0d452ed4eb38403b1bf186a0784a01a822610":{"cyrillic":true,"latin":true,"category":"sans"},"3da7fbc63097e98f1ed7607db21eb3adf657772b":{"cyrillic":true,"latin":true,"category":"sans"},"3814b56e01c5a5d4fd5863a74174aa59fc87ad62":{"cyrillic":true,"latin":true,"category":"sans"},"7e403a6b7e7526017106d41da35e240bf3492821":{"cyrillic":true,"latin":true,"category":"sans"},"d5d075df7b8c4c72e0ce4246bc80276fde65ea55":{"cyrillic":false,"latin":true,"category":"unknown"},"14ad36c8fb6053e2a768ff96dd16e6ff904a01ef":{"cyrillic":false,"latin":true,"category":"unknown"},"e5227f4e1ba0020642367e9194e71c71ac66fd96":{"cyrillic":false,"latin":true,"category":"unknown"},"3e894b106dc83bca95c210b038cb583884ae5b3a":{"cyrillic":false,"latin":true,"category":"unknown"},"666c815f939e6a7be1a98eef35d47e7cb224af6e":{"cyrillic":false,"latin":true,"category":"unknown"},"8078027a2b0375e30545777290b954d8ad84f57c":{"cyrillic":false,"latin":true,"category":"unknown"},"0e8e8d5c5ae8ef26d75d29e53e00ebc78e5d1860":{"cyrillic":false,"latin":true,"category":"unknown"},"5ebf18cf6375d59a75757b5f23a1dc9bd55a4631":{"cyrillic":false,"latin":true,"category":"unknown"},"fbaf25143b3970d9cf3d833b50ede65626c9233e":{"cyrillic":false,"latin":true,"category":"unknown"},"8f6e8c853e8e6f2a3db58d5684daae22abad6257":{"cyrillic":false,"latin":true,"category":"unknown"},"622ef850bd86cf0eb43faa4da0aad999a0009276":{"cyrillic":false,"latin":true,"category":"sans"},"6f671e39ba7c601f6ba1297eca33826e5af9aff6":{"cyrillic":true,"latin":true,"category":"unknown"},"e17c8e5e79defc2bda75ba1997d3ba19246197b4":{"cyrillic":true,"latin":true,"category":"sans"},"ed1bf23fbb1e15f6e0cc4dbe51b35fc184444a8c":{"cyrillic":true,"latin":true,"category":"sans"},"8bf7bab7a154c327249fcd8a3fefcc41690d3428":{"cyrillic":true,"latin":true,"category":"unknown"},"314df6d20d64918acbb1125eed3a72961b3322de":{"cyrillic":true,"latin":true,"category":"unknown"},"3f553857310607ef9cf21da62d3dc34b2ffa5447":{"cyrillic":true,"latin":true,"category":"unknown"},"b97737d2ccef06360bc3edc4a90aaa307ba4a5a2":{"cyrillic":true,"latin":true,"category":"unknown"},"4b2a9cacee9827b5f0b2645980b533fbf14bdff4":{"cyrillic":true,"latin":true,"category":"unknown"},"ed08e91b64749d745aaa64fce8340ff05a15635f":{"cyrillic":true,"latin":true,"category":"unknown"},"08827d6a74b4d15552c4f4309bca8f053ed14ec6":{"cyrillic":false,"latin":false,"category":"symbol"},"eb8ac5015e1a27e45d0e1ba2f99d120d34b44e01":{"cyrillic":true,"latin":true,"category":"serif"},"947db5344aa5c5bc704c23f044ec7b02b659ed40":{"cyrillic":true,"latin":true,"category":"serif"},"6a07c284a75379983f083e0109ee8d7c58d424bc":{"cyrillic":true,"latin":true,"category":"serif"},"ffcca52034f37325bdbb69158d93c2c8be3042d8":{"cyrillic":true,"latin":true,"category":"serif"},"ad01dd5a1ac716fd23f5e45bd76a5929431a27c3":{"cyrillic":true,"latin":true,"category":"serif"},"0304eed099c12aac89ff6ede88897253560faf31":{"cyrillic":true,"latin":true,"category":"serif"},"eb6055483888700260406d9447d6b2157db45d41":{"cyrillic":true,"latin":true,"category":"serif"},"b01f886977eece02a36f9f263c8cd37526d97e56":{"cyrillic":true,"latin":true,"category":"serif"},"3aea62725703478a87108c7e012c66e14fd787ca":{"cyrillic":false,"latin":true,"category":"handwriting"},"9b5d0f9484f50962abc1ea7bac0e340bb82c9338":{"cyrillic":false,"latin":true,"category":"handwriting"},"b74c3256fe84d6ee33a1a7f71402c382926eb9ef":{"cyrillic":false,"latin":true,"category":"handwriting"},"02f24fb24f19d40b8c56c68a3a4be84a387238d0":{"cyrillic":true,"latin":true,"category":"handwriting"},"6d1d4ad0ae3a5c99132524dd9ec67cc1b2043da6":{"cyrillic":false,"latin":true,"category":"serif"},"cf4e48d7e3c53c2526a75ec1a9c30ed69a3c25d7":{"cyrillic":false,"latin":true,"category":"serif"},"4fd2b7b121203018728340b3bf9fb2200870db6c":{"cyrillic":false,"latin":true,"category":"serif"},"6f040d3d23a60b71b617e81c9f7bf0a677643337":{"cyrillic":false,"latin":true,"category":"serif"},"c4f617ace32dd62ed8fef71e8a60b366712b3b61":{"cyrillic":false,"latin":true,"category":"unknown"},"d7c72300ce421b7b72db11d71b36ca8b5347f921":{"cyrillic":false,"latin":true,"category":"serif"},"eec614d783e7522a23877f784bb8a59a8018186e":{"cyrillic":false,"latin":true,"category":"serif"},"ccf54cca40068a9e65c810312ac6940357fd71a4":{"cyrillic":true,"latin":true,"category":"unknown"},"82d9139531f31951ac7e469c3f06b55429d938ee":{"cyrillic":true,"latin":true,"category":"unknown"},"81942c477fb1da96e2e967fa5335d4031af446a8":{"cyrillic":true,"latin":true,"category":"unknown"},"00d3312b1ffb41193134338e6b08a09295b557a7":{"cyrillic":false,"latin":true,"category":"sans"},"4794ad21fb04abd0d735f6ff4c717d3b8aaa575f":{"cyrillic":false,"latin":true,"category":"sans"},"584afee4d4e3a73a9b50b30ccd3958717b8bfe12":{"cyrillic":false,"latin":true,"category":"sans"},"0cf29e33e931cb2e7d2ba2ef8ab0f94fd09a19bb":{"cyrillic":false,"latin":true,"category":"sans"},"a474584604fe4f33828eb9a31f36a5e029e0b28c":{"cyrillic":true,"latin":true,"category":"unknown"},"5c466df17ceb1d61a6b96f55814183690ce093df":{"cyrillic":true,"latin":true,"category":"unknown"},"11567029907a46e0458f24683fd0a0a904da775b":{"cyrillic":true,"latin":true,"category":"unknown"},"2f9ebb43458c89583b5006c6db2ded701c491d16":{"cyrillic":true,"latin":true,"category":"unknown"},"4b1f73f220e2a50005a634048c775804e657ece3":{"cyrillic":true,"latin":true,"category":"unknown"},"45afe497d2dfed7e07f00f3ffdb4f5fdacb30fdd":{"cyrillic":true,"latin":true,"category":"unknown"},"1e54baa06ab7cab0f05afb432f32b056690a6b3a":{"cyrillic":true,"latin":true,"category":"unknown"},"f92a4d6b9ca5acb568ae78f3a013834190faaa79":{"cyrillic":false,"latin":true,"category":"decorative"},"30a1ea209cda9964c6cf347d16a6b3c71fb5e2af":{"cyrillic":true,"latin":true,"category":"unknown"},"32a7faea9cbaa15e6e06c05cbeeeecb2a6082e6c":{"cyrillic":true,"latin":true,"category":"unknown"},"a53e1dd22c53657179653187fc4c3250d8f9bdcc":{"cyrillic":true,"latin":true,"category":"unknown"},"fba3f51553362229ba56c9105fc4e1d92ec58975":{"cyrillic":true,"latin":true,"category":"unknown"},"e4661c2d333aea93d2c6e19e671171854d00065f":{"cyrillic":false,"latin":true,"category":"serif"},"d91b0bb5eeb8cb86eb622522a888a5315fad8045":{"cyrillic":false,"latin":true,"category":"unknown"},"e20c57158dc6bdb329b840de202ec7912cc2f535":{"cyrillic":false,"latin":true,"category":"unknown"},"7b622f567da0e4fd2ec5c80f4d33fbe3c82af73c":{"cyrillic":false,"latin":true,"category":"unknown"},"efb6446bdbd542a283493f3bee7dc44296801d39":{"cyrillic":false,"latin":true,"category":"unknown"},"a84716f47223c09d4ec089e7e1546a89f26474a1":{"cyrillic":false,"latin":true,"category":"unknown"},"2b6b3394f97294064b707418776c3fdfd1e6b618":{"cyrillic":false,"latin":true,"category":"unknown"},"07d2caeebdec06768d71861d07617280564b8edb":{"cyrillic":false,"latin":true,"category":"unknown"},"f3a78be409d6886a4e6cd6cf9e048119db6275e5":{"cyrillic":false,"latin":true,"category":"unknown"},"75640350c29730af789f21ae49fd41ee4e8ab802":{"cyrillic":false,"latin":true,"category":"unknown"},"58212cd9313d5ea585177a474ab1b29794e037c9":{"cyrillic":false,"latin":true,"category":"unknown"},"0fd890c772367de48dc46896e1ee5455652ccfa2":{"cyrillic":false,"latin":true,"category":"unknown"},"3fc707ee781980e4192daff8dad08994a4e3fa61":{"cyrillic":false,"latin":true,"category":"unknown"},"f6c84ba5655975a394e54b9d369a9d154a5a22bb":{"cyrillic":false,"latin":true,"category":"unknown"},"2286ad8ed20c76272c28efb3dfa002944a816289":{"cyrillic":false,"latin":true,"category":"unknown"},"59841497acd098f6eb97a021d919acca327d0e97":{"cyrillic":false,"latin":true,"category":"unknown"},"d27d45e4d831cc45addde3893b417aa988c64df7":{"cyrillic":false,"latin":true,"category":"unknown"},"5e6f7b2331e2da9b6ce6f77504d28681eb1f1705":{"cyrillic":false,"latin":true,"category":"unknown"},"f457ebc2e4b7f07715ee14bed6f944fbe6b16556":{"cyrillic":false,"latin":true,"category":"unknown"},"5dd3d7f90172a5c258457af821cd965d6df8261b":{"cyrillic":false,"latin":true,"category":"sans"},"4ece2fa96b4caa8a4d131efe353f839c6117f825":{"cyrillic":false,"latin":true,"category":"sans"},"23e8df1528453f12262b597087400ae5d15b6e50":{"cyrillic":false,"latin":true,"category":"handwriting"},"1d68b96f7bc9b22d5c60bb677883a684736ef6c3":{"cyrillic":false,"latin":true,"category":"unknown"},"52fc8db9198ac07169c1fe0969987973d42e2f02":{"cyrillic":true,"latin":true,"category":"sans"},"a56ffa2c4e86772739b9211ca7ce2ccc60b31fb2":{"cyrillic":true,"latin":true,"category":"sans"},"da774bf2345681e174375c0c28ad4907c5eabf89":{"cyrillic":true,"latin":true,"category":"sans"},"97913022dd414f4fdaa297de03d55b67926ca892":{"cyrillic":true,"latin":true,"category":"sans"},"d6d7f9924a629b8119f16da1e62ff3d7a3e238a6":{"cyrillic":false,"latin":true,"category":"unknown"},"b5bc1deeab5d8ebbfc28230df916a57f46e3730e":{"cyrillic":false,"latin":true,"category":"unknown"},"768a96d9ecab57450488a6efcd0ae1dd37ba41bf":{"cyrillic":false,"latin":true,"category":"unknown"},"136ad2e785d14c52d32789ab7edbb2af8329dbe5":{"cyrillic":false,"latin":true,"category":"handwriting"},"bc4b929269a93a6abda768fe7a504806e02d583f":{"cyrillic":true,"latin":true,"category":"unknown"},"edc4b2b1cfa2e46678cf724d8135f00a12b700c9":{"cyrillic":true,"latin":true,"category":"unknown"},"9778a3c9d5dfbca850e6063f9e2defe4c6b07475":{"cyrillic":true,"latin":true,"category":"unknown"},"a3715a14459223da5838bcc5a9b28c14a544d22e":{"cyrillic":true,"latin":true,"category":"unknown"},"012b8701fac37ef4ac553de37b0e507070d4a9e1":{"cyrillic":true,"latin":true,"category":"unknown"},"3fc6639a1cf811e1fcbdda267bf468232835aee2":{"cyrillic":true,"latin":true,"category":"unknown"},"06810ba7a30351b5ee45fb1a634f8c5143942c6b":{"cyrillic":true,"latin":true,"category":"unknown"},"23bad5795bb9b7835ff3b6c94ec2e31a399012d2":{"cyrillic":true,"latin":true,"category":"unknown"},"21af51c7ce83c7f570907cce0f0324b8617a95f9":{"cyrillic":true,"latin":true,"category":"unknown"},"4ba3d6f898d211dce6f33eaf0243fde6ffc64bb2":{"cyrillic":true,"latin":true,"category":"unknown"},"41004858f4dd05461470b3de3e277838504aef3c":{"cyrillic":true,"latin":true,"category":"unknown"},"87f26eca3a1c62a5292e9d5d1231c4970e07a4f3":{"cyrillic":true,"latin":true,"category":"unknown"},"f2ae065bbca935e59f7f130c5a286a269cba9733":{"cyrillic":true,"latin":true,"category":"unknown"},"b4375eaed962f85de83a2dd023faf96d458441de":{"cyrillic":true,"latin":true,"category":"unknown"},"74524b6f6f3ce1793cb8ba240c5ee59ba7a22e75":{"cyrillic":true,"latin":true,"category":"unknown"},"88c7b784c8b66262f1910e0c631e03dca8660ad8":{"cyrillic":true,"latin":true,"category":"unknown"},"760e8660b0e288731ff632180a416c6885c3c349":{"cyrillic":true,"latin":true,"category":"unknown"},"5f9bbd0944ebf1ed48518715a702335a0634419b":{"cyrillic":true,"latin":true,"category":"unknown"},"72a29825f1f133024910da463c47a9127af5f3ff":{"cyrillic":false,"latin":true,"category":"handwriting"},"914dba5db55f174e024562e477c51a42b314994a":{"cyrillic":true,"latin":true,"category":"sans"},"bbb571f47c26076cd8b483bfc7c176e8c06c30cd":{"cyrillic":false,"latin":false,"category":"symbol"},"3bd26b178bea790ec5bf8c5777eec7a14bc4aeda":{"cyrillic":false,"latin":true,"category":"unknown"},"525a9777cbd7ddbfcf774e193dae2d1368d36a5d":{"cyrillic":true,"latin":true,"category":"unknown"},"23ada443f792a58a4fa230f2c6a8e5d0dfa05a94":{"cyrillic":true,"latin":true,"category":"unknown"},"4d81a4afe52558c7a00350cd262a88a2f2678bf0":{"cyrillic":true,"latin":true,"category":"unknown"},"1009a7885363e5994b5cbf509cc04ec0b876052c":{"cyrillic":true,"latin":true,"category":"unknown"},"48db4b0c518e7b69e0f2a9cf61f21d9000bae35a":{"cyrillic":true,"latin":true,"category":"unknown"},"b77e5f85f2cd6ef16aca4162a6653ffde845441b":{"cyrillic":true,"latin":true,"category":"unknown"},"086fb873ba7140c847ba30bbf8e10e09bbede651":{"cyrillic":true,"latin":true,"category":"unknown"},"1be0955bb9ae10532dc922f19dea5e4bdcc14149":{"cyrillic":true,"latin":true,"category":"unknown"},"a5eaee8ba45d121b762cac2b9f33da8c09cb2e53":{"cyrillic":true,"latin":true,"category":"unknown"},"0755a017e03e5fd799bdf6953e6087f29629e44e":{"cyrillic":true,"latin":true,"category":"unknown"},"ce5b593321f88e67b7569accf388df4efeb341cb":{"cyrillic":true,"latin":true,"category":"unknown"},"828ccd457ecac770a9eccb1f3f970b97c3a8c4fb":{"cyrillic":true,"latin":true,"category":"unknown"},"360ca122af8f49554cae05dcd5b7a18ab9fd9bd5":{"cyrillic":true,"latin":true,"category":"unknown"},"bf73ee505d3dc0aec5a50a6fcd28fb72ae88dffc":{"cyrillic":true,"latin":true,"category":"unknown"},"474338da19afc46bba80b82579bb72401f2baabd":{"cyrillic":true,"latin":true,"category":"unknown"},"fd13a2c3ec87b29a6f4c372525985a499b783dd3":{"cyrillic":true,"latin":true,"category":"unknown"},"e9368f037061af95e83505efe54324abb4c38fd3":{"cyrillic":true,"latin":true,"category":"unknown"},"a8e4dab41fea95649fddef382a3d04261c2d0ed9":{"cyrillic":true,"latin":true,"category":"unknown"},"f8999c0e2295afc2473d663af263b1a175eff61a":{"cyrillic":true,"latin":true,"category":"unknown"},"163fc6d4d4e446148e01bb36376f998f5bf9f3df":{"cyrillic":true,"latin":true,"category":"unknown"},"2ff228a2dd00f10b4582f30710ecda239a6ec615":{"cyrillic":true,"latin":true,"category":"unknown"},"542c1e815f0597fdc669e34ebc707a94d13b09d5":{"cyrillic":true,"latin":true,"category":"unknown"},"46d99f3e2a1bfbe2133f7a19309a33a190f879b8":{"cyrillic":true,"latin":true,"category":"unknown"},"ab0c2d25a39266bf695a1b767aa253d23f2dfdb6":{"cyrillic":true,"latin":true,"category":"unknown"},"d54a1c3d69124db7f672e519e1904a818471bf04":{"cyrillic":true,"latin":true,"category":"unknown"},"d75bec255bef0b6449778f8c897ed5863f4611ff":{"cyrillic":false,"latin":true,"category":"serif"},"332568b2eb0423b73f116c33848ca95d8502b017":{"cyrillic":false,"latin":true,"category":"serif"},"de598fd7ab64f139d84ddcb920f07b5fa206b14a":{"cyrillic":false,"latin":true,"category":"serif"},"ec372412117d5447d1f933d606940ad14a0f2c12":{"cyrillic":false,"latin":true,"category":"serif"},"b92b522bfcb24b3a08a52fef2abcbb61889ebc03":{"cyrillic":false,"latin":true,"category":"serif"},"a20e71761bbe4e2e7e15d12de265a5afc9efa7f9":{"cyrillic":false,"latin":true,"category":"serif"},"102270b9be455d487262c55705e83967dcd05a9b":{"cyrillic":false,"latin":true,"category":"serif"},"59d5da3bb02b25b3d218109cb9da6b73e324d9c5":{"cyrillic":false,"latin":true,"category":"unknown"},"46b50fdd64f97a1c52462631101df5d1d32b1ad5":{"cyrillic":true,"latin":true,"category":"unknown"},"ea26189098ca85a084c151868dce4b35a0d7e62d":{"cyrillic":false,"latin":true,"category":"unknown"},"886c37978f0c8bf5e54e37d36f1311749cf8fe3f":{"cyrillic":true,"latin":true,"category":"unknown"},"a6449883335a094717bc819e94b82d4da6d6f7fe":{"cyrillic":true,"latin":true,"category":"unknown"},"521c0f899db24186e6d1b0decc7b6495d655c680":{"cyrillic":true,"latin":true,"category":"unknown"},"38091e5dc813cb166d5a5ddad4be68a807eaf0d4":{"cyrillic":false,"latin":true,"category":"unknown"},"bf8dc13578b88f138147169b22e1cd0fe0b5286b":{"cyrillic":true,"latin":true,"category":"unknown"},"b5b1f5f5c849a848f3cb91622d0b68b884283d0b":{"cyrillic":false,"latin":true,"category":"serif"},"87abc0e4e853008094edf2f3c9b356059f1687c8":{"cyrillic":false,"latin":true,"category":"serif"},"5ba3760c647088684d582313d440bc3add5713bb":{"cyrillic":true,"latin":true,"category":"serif"},"d66db8c69309c55bbe2a6d68f4560ba01cfa6c7c":{"cyrillic":true,"latin":true,"category":"serif"},"06fc4ea3263553eeebde6c27433cab71b4ae2c61":{"cyrillic":true,"latin":true,"category":"serif"},"3acb14c29a70106bc10ff1e25f70cc446941ece7":{"cyrillic":false,"latin":true,"category":"handwriting"},"7f72334388ced0593c1d1ab64f78cc7c6c17980d":{"cyrillic":false,"latin":true,"category":"unknown"},"17403bcaa4ded1feb41775df8b513aa4d2d42cd4":{"cyrillic":false,"latin":true,"category":"unknown"},"c7ba80b23dc547aa6ee9d4a059977d928941289e":{"cyrillic":false,"latin":false,"category":"symbol"},"31d5135eb19ffefe431e9a1d6eafee1c28b0d97b":{"cyrillic":false,"latin":false,"category":"symbol"},"0b10acc511b5286082dceae922de1668fdc7fed8":{"cyrillic":true,"latin":true,"category":"handwriting"},"64dc29f011ad1325e5cfec40a0b6cc9e2e75696b":{"cyrillic":true,"latin":true,"category":"handwriting"},"36900d35e9441206f7139f826b6d4c626d668f20":{"cyrillic":true,"latin":true,"category":"handwriting"},"f8f23e1b04b05637ed673167ee7f1bbea3dd4486":{"cyrillic":true,"latin":true,"category":"handwriting"},"25874ebb8afb6f208ba6e85b473c35b571c102f3":{"cyrillic":true,"latin":true,"category":"handwriting"},"e836c00e871a19e6212b2d43e3397387ddca566e":{"cyrillic":true,"latin":true,"category":"handwriting"},"29dbaf64f8374ba6874d79ad0f38663ea9c7041e":{"cyrillic":true,"latin":true,"category":"handwriting"},"07fdd2d942a5a668263e974c4adfd38b1852579e":{"cyrillic":true,"latin":true,"category":"handwriting"},"828d258f6a60be921e51557eab1a66ae356a1049":{"cyrillic":true,"latin":true,"category":"sans"},"2abd6e2a127dd4488675b6cf24f477daedf187a2":{"cyrillic":true,"latin":true,"category":"sans"},"01eccc38a5559bce3ffbbfbf3319c7f82baf38f8":{"cyrillic":true,"latin":true,"category":"sans"},"94724224105ab5b3361cae25b17e284379a66644":{"cyrillic":true,"latin":true,"category":"sans"},"68bec1cfca67ad8dd8e9cd60c11b88a91a761790":{"cyrillic":true,"latin":true,"category":"sans"},"9b2d98916ad67b9d2c13f6f5be50128bbe3b90ad":{"cyrillic":true,"latin":true,"category":"sans"},"fb3a1b71f7eca642c5ffe1623aae8c3036ba37d0":{"cyrillic":true,"latin":true,"category":"sans"},"dc71e7291e3195ba154f8d818c3d353754c8be11":{"cyrillic":true,"latin":true,"category":"sans"},"7c7ee1757566e0932e8f81edf57850806932e14d":{"cyrillic":true,"latin":true,"category":"sans"},"327b9480e8258811a9580299bb74f4f48f1e34fb":{"cyrillic":true,"latin":true,"category":"sans"},"d2a85f117dfc26b7a001d382a83bcdc86ccee06c":{"cyrillic":true,"latin":true,"category":"sans"},"f5f701ebcd54a416a87a32b71f7eae6d784269df":{"cyrillic":true,"latin":true,"category":"sans"},"8e8642af56c87f1a1f5e83e6261f4d260a40b61b":{"cyrillic":true,"latin":true,"category":"sans"},"6515f34f918c7218776b6c1a39d607ed7b8c8dab":{"cyrillic":true,"latin":true,"category":"sans"},"fe8f513e51d5c3273a3f1938e8e86dbfa110349d":{"cyrillic":true,"latin":true,"category":"sans"},"2b1306876e88e7eacc06e887d4f53e044e09624f":{"cyrillic":true,"latin":true,"category":"sans"},"4e9dddd33421e4eb485b84c32a432a91f2bc977a":{"cyrillic":false,"latin":true,"category":"sans"},"39cddb47282bbc9bab1987b23bf2f203d9a10075":{"cyrillic":false,"latin":true,"category":"sans"},"5130192bda07d8e5f1ba37c70927a90f025b3bc0":{"cyrillic":false,"latin":true,"category":"sans"},"10f7a63b9f3469901b6497544457cb93140b6e3b":{"cyrillic":false,"latin":true,"category":"sans"},"e13faf345e8d6868f16852f4c0352d4fa5caa992":{"cyrillic":true,"latin":true,"category":"sans"},"56222647f66241a2e672836167ab9d424e789872":{"cyrillic":true,"latin":true,"category":"sans"},"b79b807fc6bd0cd3b44fbb37d3cbd2b1f3a41b0b":{"cyrillic":true,"latin":true,"category":"sans"},"f2a5231b133381dd69aa491d944ba736b69f38f8":{"cyrillic":true,"latin":true,"category":"sans"},"ba5653c3ace747a5ce4bce2ba8eaba363d17578c":{"cyrillic":true,"latin":true,"category":"sans"},"ba73c4fcd49ae7490991d84c0d249061489c1f98":{"cyrillic":true,"latin":true,"category":"sans"},"d0f380ae68b66fdb6ca6d96f1c513aeb69ad80e8":{"cyrillic":true,"latin":true,"category":"sans"},"e5d022090b28163b4caacd2b4c1765a69aecaa21":{"cyrillic":true,"latin":true,"category":"sans"},"f049fe7127bcfac663a8dc8bdfe27daf1187a298":{"cyrillic":false,"latin":true,"category":"sans"},"9254903a13b131bd952fb774424740f27ad0a646":{"cyrillic":false,"latin":true,"category":"sans"},"a1f823487ca69176d77fb227e6c0c20fd3449a35":{"cyrillic":false,"latin":false,"category":"unknown"},"da0ff7c247f33300f0708e8b57946f991addaccd":{"cyrillic":false,"latin":false,"category":"unknown"},"c6b63858f3903fea094b164772bb7fb61019e09b":{"cyrillic":false,"latin":false,"category":"unknown"},"419a588f3bc453bdcd2f0816932aa11fff1208d4":{"cyrillic":false,"latin":false,"category":"unknown"},"4c953bd4302d512035ab4bc60f42896ff5af28bc":{"cyrillic":false,"latin":false,"category":"unknown"},"7d106e506ab2d68a4af8b9c7a760234c9cba1273":{"cyrillic":false,"latin":false,"category":"unknown"},"53a06f7d49bf587d81f01f4f5d7ebebee1797812":{"cyrillic":false,"latin":false,"category":"unknown"},"3a350a14dfe8d87e9ffbcc553f30eafc1d759dd4":{"cyrillic":false,"latin":false,"category":"unknown"},"6f282b6ca2fa4cff5e9bd3afc9aba371e3ac79fc":{"cyrillic":false,"latin":true,"category":"unknown"},"ac7941b465e41ce6a363d9336c00825fe120cbe7":{"cyrillic":false,"latin":true,"category":"decorative"},"85cf6c1a8d8472543e24aee944975f9e2281b356":{"cyrillic":false,"latin":true,"category":"unknown"},"a9afd7c1e59b4aa999fed9c7e078caf56f3d0622":{"cyrillic":false,"latin":true,"category":"unknown"},"633206e83a903d0e3cf3586ac3512b6b8a6753d7":{"cyrillic":false,"latin":true,"category":"monospace"},"47dea857fb15cc66426a33ae5538a4dda9f83703":{"cyrillic":false,"latin":true,"category":"monospace"},"c09efe31140717bb4d56fd56ec6069438aa37c85":{"cyrillic":false,"latin":true,"category":"monospace"},"c100fac99db47208c4f1593eaff0ecedca553f1c":{"cyrillic":true,"latin":true,"category":"serif"},"dfdb3a59775ad7fcab8e191b39eef2d8956096a6":{"cyrillic":true,"latin":true,"category":"serif"},"5f5357414466f68ed84e269bf2224225077c459c":{"cyrillic":true,"latin":true,"category":"serif"},"e46c3c90cafc30805a4a348b66dd4794acbd7247":{"cyrillic":true,"latin":true,"category":"serif"},"af5198a44dcea1c9c4456b4b940d6163c9bc917f":{"cyrillic":true,"latin":true,"category":"serif"},"8d28dcf80d91672d69f625f17e2588f5c6fd6971":{"cyrillic":true,"latin":true,"category":"serif"},"1a03a9b8da40bceec6ca8c032b579f3d579095dc":{"cyrillic":true,"latin":true,"category":"serif"},"d4cfe05d9050fbf8625d06f7773f0b9c7a1667a2":{"cyrillic":true,"latin":true,"category":"serif"},"7b286f4e073c72f1f8851f84eb3783b5c2eb566c":{"cyrillic":true,"latin":true,"category":"serif"},"bd4f6d35542dbb58b199589be0592ab8bf49784b":{"cyrillic":true,"latin":true,"category":"serif"},"cb8ce4215ec60ec80b3f0a2b200cae0270d5df8f":{"cyrillic":true,"latin":true,"category":"serif"},"ffaf3578f18e1d66a1abb47f569415ced56dac33":{"cyrillic":true,"latin":true,"category":"serif"},"90f7a73ff6e662dd971d810c81ebd89d0134ab6a":{"cyrillic":true,"latin":true,"category":"serif"},"239d86ba1f23677ac67044ffc15980c493fdadbf":{"cyrillic":true,"latin":true,"category":"serif"},"a20953ac844fe981de6be8c473cbf4d7f122883b":{"cyrillic":true,"latin":true,"category":"serif"},"e0ef60f2145c759a8989cd1fb2c0d7aaf9608395":{"cyrillic":false,"latin":true,"category":"unknown"},"64628b19982d916007ec516a29e09495ef6364de":{"cyrillic":false,"latin":true,"category":"unknown"},"221e79c89c1c5f6c8e2ff2fb4abf406acea62bd1":{"cyrillic":true,"latin":true,"category":"unknown"},"29ba72e65c19145ac90280fdb54e027c94bd6563":{"cyrillic":true,"latin":true,"category":"unknown"},"85665dcb6b07a2177d0cc2bfa300b1ce0f701c52":{"cyrillic":false,"latin":true,"category":"handwriting"},"2c84e5fa9e3c86b3c6ce86ce48d455ed4ed20c69":{"cyrillic":false,"latin":true,"category":"unknown"},"974b60b2e6479778ebc97cf4a214e4fb7d6f80a0":{"cyrillic":false,"latin":true,"category":"sans"},"3a914853e5f27c88b21c192e2a851275963bb2ab":{"cyrillic":false,"latin":true,"category":"sans"},"3679d716b7eaf66409216d7def8f3e022b258052":{"cyrillic":false,"latin":true,"category":"sans"},"0d2b70564b5cf51397c0dd5c92071ddc167bdd06":{"cyrillic":false,"latin":true,"category":"sans"},"1aaf33bfa1c2b61bc7393d91cb178576f74a44b6":{"cyrillic":true,"latin":true,"category":"unknown"},"85b96c09944c6cdb061f69973be790da231b0168":{"cyrillic":false,"latin":true,"category":"decorative"},"88442119b93b0e5677864dc56e5e9ef1d97467b2":{"cyrillic":true,"latin":true,"category":"unknown"},"0749788b19bba5dc4a0ab6487cec1f1615562302":{"cyrillic":true,"latin":true,"category":"unknown"},"c359725bda7c387931740ac00b097d7f304fb103":{"cyrillic":true,"latin":true,"category":"unknown"},"a6d579bd29f796937a3a6d4020f639c84bc0680f":{"cyrillic":false,"latin":true,"category":"unknown"},"d495fec09d7a27aae88a26f654eaeb92b7f45bc4":{"cyrillic":false,"latin":true,"category":"sans"},"492f13ad30d7ad8e44b3b0b04d9b142902307791":{"cyrillic":false,"latin":true,"category":"sans"},"8d51c6507a1841b47f88e8a40cd8df389367b519":{"cyrillic":false,"latin":true,"category":"sans"},"61643515b43d9ff0d21a9c439b05eda2000d38cc":{"cyrillic":false,"latin":true,"category":"sans"},"c505fa9d12c0bafe053bc9eea552d7053bde8321":{"cyrillic":false,"latin":true,"category":"sans"},"629230bc04803bf206355b6c52872eb6639e3e92":{"cyrillic":false,"latin":true,"category":"sans"},"e1d0540db2a67cb3c2f91d7b296ee676d7cbca6d":{"cyrillic":false,"latin":true,"category":"sans"},"cb52ca1c83e5b736a45eb9a4ce1c9dd4151e9e62":{"cyrillic":false,"latin":true,"category":"sans"},"332a5739bbe70600b334275b7a5f9cd7ba56cd5e":{"cyrillic":false,"latin":true,"category":"sans"},"f757941bac5d74d2b656de04f43d723c08e7fc29":{"cyrillic":false,"latin":true,"category":"sans"},"62233dcb9ea85e677ffbb0f8f83c8729f6ea0d5f":{"cyrillic":false,"latin":true,"category":"sans"},"d7e2cf821c9b1bd5f167dbcf6e006e949e54022f":{"cyrillic":false,"latin":true,"category":"sans"},"d20fce24a242faa2b85e98d0e82bbdda1d7e0796":{"cyrillic":false,"latin":true,"category":"sans"},"4d19b392478b4fdf46fbcea40bf58fbf99919709":{"cyrillic":false,"latin":true,"category":"sans"},"a88ab4a083a5f2eccab86ba3b7c45ab580219cc0":{"cyrillic":true,"latin":true,"category":"sans"},"cf42040f1795b0efec3ad3962933739cc76009c8":{"cyrillic":true,"latin":true,"category":"sans"},"20b1d58df35706e1e2d6e66857d187934b852c63":{"cyrillic":true,"latin":true,"category":"sans"},"a34ab7b909611a92cc676a46b79dec9aeca19c1d":{"cyrillic":true,"latin":true,"category":"sans"},"3bff804350123de7dc79204cd5ef998c9ba3c257":{"cyrillic":true,"latin":true,"category":"serif"},"596f6e6ad111c8195d4cd3191b3b3ebdba0312ed":{"cyrillic":true,"latin":true,"category":"serif"},"f879a3bdc743e4b8e83a0a2484c9858da8102c28":{"cyrillic":false,"latin":false,"category":"symbol"},"3c9944265608342524c95a23615f977e81c6685b":{"cyrillic":false,"latin":false,"category":"symbol"},"0cf4f4d6a197063fac3fd4a3a00658ef9bd1bd0e":{"cyrillic":false,"latin":true,"category":"unknown"},"5b4169275be5c0d6b6a2c9d0e6d917dd0a929033":{"cyrillic":true,"latin":true,"category":"unknown"},"e89140b160dd85b2722eb7d580cf6097936ddc3f":{"cyrillic":true,"latin":true,"category":"unknown"},"698c9169063ee5a50e6e5641391fd7579da6dfbb":{"cyrillic":true,"latin":true,"category":"unknown"},"767939bf264b4e4e49589934d0bf043118113cf7":{"cyrillic":true,"latin":true,"category":"unknown"},"4ca38b6e7e2c0f9150fd7e9805f00a840a5396ec":{"cyrillic":true,"latin":true,"category":"sans"},"34289e71baee03a5adf3f1c94925f402343a5ec0":{"cyrillic":true,"latin":true,"category":"sans"},"c75eeb7a571671042cf61eecda94179ab905bf95":{"cyrillic":true,"latin":true,"category":"sans"},"76e1aee2cd6c683ddeec802e5b0ab6268fca046c":{"cyrillic":true,"latin":true,"category":"sans"},"245e9175b4128f7b97f0e59baaa9923c9932bdba":{"cyrillic":false,"latin":true,"category":"sans"},"399c5ae69c10c696cf7b6fd3faef84c75f8a2ff2":{"cyrillic":false,"latin":true,"category":"sans"},"98cb54ae756fe8d9b80fd8d61bae3e2f13a15944":{"cyrillic":false,"latin":true,"category":"sans"},"56ced279c4c5f314d845f453194f34710c907cdc":{"cyrillic":false,"latin":true,"category":"sans"},"1c9afd68ecc57b78fc50d68c50d0c3dbfe85b38a":{"cyrillic":true,"latin":true,"category":"unknown"},"cb31d7ce568b774993b837ac7459a873c2c6a420":{"cyrillic":false,"latin":true,"category":"sans"},"c87997dff6be74bc41b4658218fb43e2dfb9a66b":{"cyrillic":false,"latin":true,"category":"sans"},"7ffcd3be6b075524bec41e9dcb62ee4b2b41e2f6":{"cyrillic":false,"latin":true,"category":"sans"},"8bf5a64d001fafe7fae2b20587c6d5dc81ee8557":{"cyrillic":false,"latin":true,"category":"sans"},"29c0e9725f97a644c85382efa6b49ca0ae71ed34":{"cyrillic":false,"latin":true,"category":"sans"},"4e2882ac5a9ec62d18f74afbb055c94f85f487c8":{"cyrillic":false,"latin":true,"category":"sans"},"5f961242f6906e9d50b31cb7a93261b44778646b":{"cyrillic":false,"latin":true,"category":"sans"},"8393988a8be6b6d5e528edde1d633d3362a67d01":{"cyrillic":true,"latin":true,"category":"unknown"},"d6fbbac3ade0bd18d61261430e497967c068c589":{"cyrillic":false,"latin":true,"category":"handwriting"},"e6a973fffa111a9cdf2dcd9cc2ec7aeae4e6a519":{"cyrillic":true,"latin":true,"category":"sans"},"c8459c40d91175e359ee8f98909c4994e5dda669":{"cyrillic":true,"latin":true,"category":"sans"},"d172b410cf4aed08f512ca3085fae0fa7668c93c":{"cyrillic":true,"latin":true,"category":"sans"},"7d3f733dce3126cd7dda0914ee18cf4e3136f4dc":{"cyrillic":true,"latin":true,"category":"sans"},"65f964be0ba91017ad4711ea56dbf24c70b4e92b":{"cyrillic":true,"latin":true,"category":"sans"},"af5259143cbed960c5101a81813d946090801bf8":{"cyrillic":true,"latin":true,"category":"sans"},"0095507dd21c0336428e8fc4bdf4076b86a523fc":{"cyrillic":true,"latin":true,"category":"sans"},"0103dd978b66bc38077c748a0b43ac58bbbde9cf":{"cyrillic":true,"latin":true,"category":"unknown"},"9d77a1a18e93414f3ba2b967f6298fb2640d01fb":{"cyrillic":true,"latin":true,"category":"serif"},"cfe1845d62e6c99b4338aa48d1a9089af2923fdb":{"cyrillic":true,"latin":true,"category":"serif"},"ef4ae2d394138eca6c3c98d72c33332261244c61":{"cyrillic":true,"latin":true,"category":"serif"},"bb5b9fe500a8f0549eae06a8923c9add3fd96ee4":{"cyrillic":true,"latin":true,"category":"serif"},"36928f888f6372bf3a29ae6d0bddc599fd03d5d6":{"cyrillic":true,"latin":true,"category":"serif"},"9413fb4db98e368036b85e8d08aa5259390f05cd":{"cyrillic":true,"latin":true,"category":"serif"},"7cdd622dfd7ad6c7bb0791403cc8bf09320000d3":{"cyrillic":true,"latin":true,"category":"serif"},"b83660fd393087c265dc0785b799322807341567":{"cyrillic":true,"latin":true,"category":"serif"},"fe7d89231add89feca40bedcfeec742dcd2cec86":{"cyrillic":false,"latin":true,"category":"serif"},"1bd26d8feaa787362ba54702e6cf05f986fe77b7":{"cyrillic":true,"latin":true,"category":"sans"},"9f7891a2f4ea7c212ca4f8b7ee5ae00b05c85b0a":{"cyrillic":true,"latin":true,"category":"sans"},"5db78192a7f3384370fcc450db31a0fc9383a3b3":{"cyrillic":true,"latin":true,"category":"sans"},"e9eb6f596fe2685a0473d5389d8ad3b214967726":{"cyrillic":true,"latin":true,"category":"sans"},"2557330c8102165e593c6f14185c90cf78caf0ff":{"cyrillic":true,"latin":true,"category":"sans"},"fd076528a520b75690566e75e9504b776d6efd60":{"cyrillic":true,"latin":true,"category":"sans"},"ad9fbed14066c861a49b71a6440dbdd189b3d061":{"cyrillic":true,"latin":true,"category":"sans"},"3929f476b47247f5559834bf82ff6d98dd277e38":{"cyrillic":true,"latin":true,"category":"sans"},"d267092bd35ff4b55aa01a7f9f68c71c28cdb1b7":{"cyrillic":false,"latin":true,"category":"unknown"},"2d0a8e234cdb3da8b3ea0138ebd8366c9f737d1e":{"cyrillic":false,"latin":true,"category":"unknown"},"e99585fc9b78255219285fd24b75d1b4ba73ed60":{"cyrillic":false,"latin":true,"category":"unknown"},"8274d984d4742587e04ea5801b31f752e6ad845f":{"cyrillic":false,"latin":true,"category":"unknown"},"caf02b7c931e025dd4c6dc64d10163c252cd40a6":{"cyrillic":false,"latin":true,"category":"unknown"},"fa76a97fb0b39c4f71ccc8ac561e89c4676f3a08":{"cyrillic":false,"latin":true,"category":"unknown"},"f66f8f375c9aac282002a0040f808aeccc6b9718":{"cyrillic":true,"latin":true,"category":"unknown"},"48bd7ea83e25511fa8cd0964297048d8470c03be":{"cyrillic":true,"latin":true,"category":"unknown"},"66be2b8dfadb7dc80abb4050ea53b34594d33125":{"cyrillic":true,"latin":true,"category":"unknown"},"5909af066485acdf4d1f551e6e5610ad29162af8":{"cyrillic":true,"latin":true,"category":"unknown"},"ba2cc52f88e7280369565086f021861c1bf8e92c":{"cyrillic":true,"latin":true,"category":"unknown"},"17cd2de25a3e534b84a81f4e006a50d46a83e2d3":{"cyrillic":true,"latin":true,"category":"unknown"},"a1b0b77cf89d0b957ebac6773e5ee50a5473f92b":{"cyrillic":true,"latin":true,"category":"unknown"},"dfd07645fddc232eba0614ee33431b9e50e716b6":{"cyrillic":true,"latin":true,"category":"unknown"},"6bff33e60e9b87abe1d7bea35e726bc7ec3f3cdd":{"cyrillic":true,"latin":true,"category":"unknown"},"a074215242c597ccadcf7ea9f06f34d3959e38c2":{"cyrillic":true,"latin":true,"category":"unknown"},"fd85bc0492276b8309ed2edea59daed618542a63":{"cyrillic":true,"latin":true,"category":"unknown"},"db50c1f158d57f67bbecd6db524d1676be4a6407":{"cyrillic":true,"latin":true,"category":"unknown"},"196a8586dfb73ec3171bcd8c6b91a30b6290114a":{"cyrillic":true,"latin":true,"category":"unknown"},"44b543b8dc2bf43fa1b96eef180c65f4137ab383":{"cyrillic":true,"latin":true,"category":"unknown"},"c820a72880ee9393bbd0f3cfeb1fd1a7e87ed6ea":{"cyrillic":true,"latin":true,"category":"unknown"},"2ecf0cb66ab4ab6571edd648050577bc1c54dcec":{"cyrillic":true,"latin":true,"category":"unknown"},"6dcdc0e34909d6bbc0a88ea8c4156290c87507fe":{"cyrillic":true,"latin":true,"category":"unknown"},"68e664ffff6b7c2c5ed43f446cd204f5dc59b900":{"cyrillic":true,"latin":true,"category":"unknown"},"b3291c398beb2b19a53e1dc31923b046ad651ad9":{"cyrillic":true,"latin":true,"category":"unknown"},"463096d55f86066004914da19ad17e3fce5d9b51":{"cyrillic":true,"latin":true,"category":"unknown"},"e45aa7c74c8391a14a86869f0eca1ac8bd409675":{"cyrillic":true,"latin":true,"category":"unknown"},"c09714f9cd752fa4683417aeebf95e2d85cdeef0":{"cyrillic":true,"latin":true,"category":"unknown"},"9274c1f72beb430c433ef82a559dfa49d78139b8":{"cyrillic":true,"latin":true,"category":"unknown"},"4221e3a7eed38243c5efdb750e3ab872b9c7d1f0":{"cyrillic":true,"latin":true,"category":"unknown"},"1a1854f8b0656c105788d8167bcf584878eba105":{"cyrillic":true,"latin":true,"category":"unknown"},"4bd4b975084732d4f3a560656c3dc8b5ac835b8d":{"cyrillic":true,"latin":true,"category":"unknown"},"4067bb875a1b4e38d5833c108192b3e1f20f2758":{"cyrillic":true,"latin":true,"category":"unknown"},"c06daaf81f17110c08ba30074b890a935a1dfeb6":{"cyrillic":true,"latin":true,"category":"unknown"},"714f286d3496e86f5c07e409fb46083d8970cefb":{"cyrillic":true,"latin":true,"category":"unknown"},"b116349d83bc20d11a4da61d9572734ea0b1f21d":{"cyrillic":true,"latin":true,"category":"unknown"},"0bb183cd6afcd9934d93f48321b2e9190eb152e9":{"cyrillic":false,"latin":true,"category":"sans"},"32063015c7284eb72ec6e0814efe49917ff7c7d2":{"cyrillic":false,"latin":true,"category":"sans"},"9c8daf6deb82483872dbc27de58525ac6bae6530":{"cyrillic":false,"latin":true,"category":"handwriting"},"5c5bd0747ac677725b45be17b1df8257e08d5c18":{"cyrillic":true,"latin":true,"category":"unknown"},"fa10422e250634b00580cc52864a93e36b7c7859":{"cyrillic":true,"latin":true,"category":"sans"},"a3af0d2cb46b8ecfe9304bb9dd77f7386db066ce":{"cyrillic":true,"latin":true,"category":"unknown"},"c9a7b78a8b6f9b267d09a3ef7e4b254289824d18":{"cyrillic":true,"latin":true,"category":"unknown"},"79fc27b3c9c18a501d269fcb44386343f492a2bf":{"cyrillic":true,"latin":true,"category":"unknown"},"1f3d5a254c6b5459b533b8f6c3a3de40dca876c2":{"cyrillic":true,"latin":true,"category":"unknown"},"5f68681f4218b897ffe77d40180efb7918029028":{"cyrillic":true,"latin":true,"category":"unknown"},"163155e80e875194144e50a382096891b5bd7ea4":{"cyrillic":true,"latin":true,"category":"unknown"},"54fe0f93c242815210c72dbd6fc3ad89f07eba24":{"cyrillic":true,"latin":true,"category":"unknown"},"ba052a9e90b1c35da804b4f3e935cdb68adca789":{"cyrillic":true,"latin":true,"category":"unknown"},"ba9773ecea4d11861e2f9e692004104e0c0c64d1":{"cyrillic":true,"latin":true,"category":"sans"},"4588febb30f4c566af0615596d9daa7b45006097":{"cyrillic":true,"latin":true,"category":"sans"},"b4ccb55c0adacbe4740c9056f1915eb27aff003d":{"cyrillic":true,"latin":true,"category":"sans"},"67ff93f82e278f84dbfe606b34bdb428aff96a94":{"cyrillic":true,"latin":true,"category":"sans"},"747608467f827902dda1a21f9c8090c01f97a35c":{"cyrillic":true,"latin":true,"category":"sans"},"ca5e93b7331f67821112d23b6d5f9b529613cab6":{"cyrillic":true,"latin":true,"category":"sans"},"19159814f73ea854f0181bc6bac7e98f1c0cf671":{"cyrillic":true,"latin":true,"category":"sans"},"c4ac591aee695c0b7adf1b769226ce665f18ca67":{"cyrillic":true,"latin":true,"category":"sans"},"7f53796a603b886a9a20af4f1c2c98cb0ffcef3e":{"cyrillic":false,"latin":true,"category":"unknown"},"e08d33861696eab7a5b22631acfe313760221cd5":{"cyrillic":false,"latin":true,"category":"handwriting"},"2186a85ef11e7628fcedf1d8e72f8abd0f3c5e5a":{"cyrillic":false,"latin":true,"category":"handwriting"},"1dc258125dad5e1fe031e1263c9bc01dda41b520":{"cyrillic":false,"latin":true,"category":"handwriting"},"d2ab074a3c385276076b2962bad79ec55959f038":{"cyrillic":true,"latin":true,"category":"unknown"},"aa86e6b937df15573e5dcd0cd2494fb2ac6b1805":{"cyrillic":false,"latin":true,"category":"serif"},"73a82d69524ce639fc76e71e6c4db3307a9c8e98":{"cyrillic":false,"latin":false,"category":"symbol"},"3c9f0048d4260ecf50a910c17b29cab2ff25072a":{"cyrillic":false,"latin":false,"category":"symbol"},"ca547bc7a25f927b376e32d930a18121300b723c":{"cyrillic":false,"latin":true,"category":"unknown"},"41737160a4e58f68a62459d19fb822b9c556c07a":{"cyrillic":false,"latin":false,"category":"symbol"},"c888b5f57d1b5e7c8a2af9515c88f5f4a84ca4e0":{"cyrillic":false,"latin":false,"category":"symbol"},"5ac580e021f4f500f9defabc0dd82a6bc5d06ff7":{"cyrillic":false,"latin":false,"category":"symbol"},"a25092a626ea8ffb0c37581b50fa502c84fa4a83":{"cyrillic":false,"latin":false,"category":"symbol"},"011872adcde46352bea67c35464602063d84efdc":{"cyrillic":true,"latin":true,"category":"sans"},"2392a66f54945ccd7bbe1116b88fbfb5367c90c2":{"cyrillic":true,"latin":true,"category":"sans"},"9f2ae670e6ab172ac6603a79f39865ff5cd326bb":{"cyrillic":true,"latin":true,"category":"sans"},"469cb1e5de83e699914146cfb53bd2c989f21e86":{"cyrillic":true,"latin":true,"category":"sans"},"0b6db5298ec87d7fc1991ffcb43ff217dfc3bb68":{"cyrillic":true,"latin":true,"category":"sans"},"d2edbe78f58108b606976470faa1eed58d37f234":{"cyrillic":true,"latin":true,"category":"unknown"},"9eaab2ab74ebf2024d5e2c8351e8f4017f8d88c2":{"cyrillic":true,"latin":true,"category":"unknown"},"810273f6c0fb1c11923b2fb37562ec2f487e4433":{"cyrillic":true,"latin":true,"category":"unknown"},"45ec29b76a7c569af98d156cdcf0931e5fe746d9":{"cyrillic":true,"latin":true,"category":"unknown"},"855a316f1e0674be1aec73d497a6b3a0e687c6fe":{"cyrillic":true,"latin":true,"category":"unknown"},"b6295c32a39e3ad9e96d05d3b432d48771ce7905":{"cyrillic":true,"latin":true,"category":"sans"},"93be66261e6a375f1b0114bf62f9d45aa2d41dd9":{"cyrillic":true,"latin":true,"category":"sans"},"db20694678dc0569921a1ef65883a43b15362b29":{"cyrillic":true,"latin":true,"category":"sans"},"55dc499973cb8863013ab80000eefae9bf520d64":{"cyrillic":true,"latin":true,"category":"sans"},"9bae9cb187e64b379473db5c1b08ee643f1cdf5b":{"cyrillic":true,"latin":true,"category":"sans"},"44bf617b21d55b1a1e877c71d73b1f54f38a7d0d":{"cyrillic":true,"latin":true,"category":"sans"},"22a46a3a3b425d432c107eff0cfff33475a54936":{"cyrillic":true,"latin":true,"category":"sans"},"e2748cbd0f66270484421cd1d1d422f8108d4b3a":{"cyrillic":true,"latin":true,"category":"sans"},"1f2b87844653508c25227106157778152ee65b72":{"cyrillic":true,"latin":true,"category":"sans"},"7ccd322bf1babfec9fbb57bacbc02531d74b0a93":{"cyrillic":true,"latin":true,"category":"sans"},"35f0f2b171dfe64aa6fc61687ac8331b7b2e2e6f":{"cyrillic":true,"latin":true,"category":"sans"},"aa40df613d6f51015d17030fe71d8692ac487070":{"cyrillic":true,"latin":true,"category":"sans"},"a7420d26f19683ea2c86349b2515c517217f79a3":{"cyrillic":true,"latin":true,"category":"sans"},"6475573fe29829ae6442068e2e50c173c8210a60":{"cyrillic":true,"latin":true,"category":"sans"},"50b0aec72b067199cee071d238f42870d714bdec":{"cyrillic":true,"latin":true,"category":"sans"},"09b15e77ae1bc81597c07470ae7b7709b31f0d5f":{"cyrillic":true,"latin":true,"category":"sans"},"2e2256bd8bcb226f07c9b3c4859f4d08f5849138":{"cyrillic":false,"latin":true,"category":"unknown"},"0ebaaf0d2d25211ade7abe371a5a9cfb0f9b186f":{"cyrillic":true,"latin":true,"category":"unknown"},"f17a551f254c95dd24cf9ed8e4ffa4e71fca8899":{"cyrillic":true,"latin":true,"category":"unknown"},"0ef7c4d974a4f49b6ed0c8993e2de7f9d1c25947":{"cyrillic":true,"latin":true,"category":"unknown"},"437b95e1ba0bcf663d5f933d7570b9db4a2a567d":{"cyrillic":true,"latin":true,"category":"unknown"},"11c9fc32a52c6d8cae0521d181787c24ad5651ca":{"cyrillic":true,"latin":true,"category":"unknown"},"101f9c74915c3da9bacafdc1754d8d93d460639f":{"cyrillic":true,"latin":true,"category":"unknown"},"f010e8252a8be9cea946ad05c6ac9d7c9884d64e":{"cyrillic":true,"latin":true,"category":"unknown"},"1811059f99a257de1c2297ae6d5752ed590e062f":{"cyrillic":true,"latin":true,"category":"unknown"},"d0d39a4d501c7ed5483f2c20d53b05e200d5c480":{"cyrillic":true,"latin":true,"category":"unknown"},"41091e08d6f30ac411aab92c24abe2b8d7242640":{"cyrillic":false,"latin":true,"category":"unknown"},"5b2e35ffd8e0c44b1f45c0d507c56a764919f3b6":{"cyrillic":true,"latin":true,"category":"unknown"},"df66d06954e6bd9c85800b915e0bbcba6bc3a4ed":{"cyrillic":false,"latin":true,"category":"sans"},"fd9b2393871cb244b63a192de90c443ca30e6bb2":{"cyrillic":false,"latin":true,"category":"handwriting"},"ce8028d5bdadf712b8ebcac7ce0a6d3bb0476eb3":{"cyrillic":false,"latin":true,"category":"unknown"},"c3e0cb10f88d8c67d1996f8cdb3c033aa2f95fe4":{"cyrillic":false,"latin":true,"category":"unknown"},"f7a434af7041c8ab3d7b456b6eaf1e03abcad3d5":{"cyrillic":false,"latin":true,"category":"unknown"},"6e180902d45508601cefcdb97eaba048ee00e8ad":{"cyrillic":false,"latin":true,"category":"unknown"},"7a254a722cc7ff42965956623b1db1f4d98a7968":{"cyrillic":false,"latin":true,"category":"unknown"},"904dd8a2014c715bbfbe0c6708df8a2c7f5c384c":{"cyrillic":false,"latin":true,"category":"unknown"},"035c21644bb77da3c44553be97b0133fa6fcd832":{"cyrillic":false,"latin":true,"category":"unknown"},"a846bb904bab00de6cee6a898c5f7c3d8a9e7d96":{"cyrillic":false,"latin":true,"category":"unknown"},"9086c4f012bdf3f44369210be2fe832c6cc2534c":{"cyrillic":false,"latin":true,"category":"unknown"},"24b3b3d50ee52e1ef2f06150025c1fb0f82dfeca":{"cyrillic":false,"latin":true,"category":"unknown"},"ba8da630297a873c3210a5534b300f56ec93e137":{"cyrillic":false,"latin":true,"category":"unknown"},"26a6ce04545a8de41264c976a468e60a2edf5dc9":{"cyrillic":false,"latin":true,"category":"unknown"},"cb9e90c06e03988d80ec336594adbe42916e40c3":{"cyrillic":false,"latin":true,"category":"unknown"},"7fe608d17ea99f36ddfd7cd5f5951e34d666558c":{"cyrillic":false,"latin":true,"category":"unknown"},"f22d1306beb5c6a62dc65f458cf46b67132e6efd":{"cyrillic":false,"latin":true,"category":"unknown"},"b444346f0256975ba85312d6b8d43c30f1849354":{"cyrillic":false,"latin":true,"category":"unknown"},"107ed235ea16b04aa772f6ca7d6332e17a7796b9":{"cyrillic":false,"latin":true,"category":"unknown"},"470a94a9ae3d0be09f007a3d4632e6c8673c21d5":{"cyrillic":false,"latin":true,"category":"unknown"},"93a6f05b4c616d09db7b291eeec853af5ff96b4f":{"cyrillic":false,"latin":true,"category":"unknown"},"3704d7dc57de0ed8e83aaf6354883cd59b8327a7":{"cyrillic":false,"latin":true,"category":"unknown"},"8fc748a11a42920b31c738799932820248ddb803":{"cyrillic":false,"latin":true,"category":"unknown"},"ff0c13fbacbf4ed0e203877cd7c8a1897477023e":{"cyrillic":false,"latin":true,"category":"unknown"},"e9f5c9be87e834812448317ebbf263c6471e5789":{"cyrillic":false,"latin":true,"category":"unknown"},"f97e02f8c69771ed64d54a802f1f149c52fb72c2":{"cyrillic":false,"latin":true,"category":"unknown"},"a6726c1ed07d115e32cff28c840a9e06c1dbd137":{"cyrillic":false,"latin":true,"category":"unknown"},"2a3a6eb579aec780898ef3a9329cb71d9e5790d3":{"cyrillic":false,"latin":true,"category":"unknown"},"bec35966cbfd830dfa3b920c6677b54a23ab47f1":{"cyrillic":false,"latin":true,"category":"unknown"},"01d02e2a3e65d11a40aee572620372e0be064bb6":{"cyrillic":false,"latin":true,"category":"unknown"},"6f0d4b362b2c08c0da98f3f650fe4654aa1378f8":{"cyrillic":false,"latin":false,"category":"unknown"}};
const prFontLanguage = document.getElementById("prFontLanguage");
const prFontCategorySelect = document.getElementById("prFontCategorySelect");
const prFontFilterNote = document.getElementById("prFontFilterNote");
const PR_FONT_CATEGORIES = [
  ["sans", "Без засечек"], ["serif", "С засечками"],
  ["handwriting", "Рукописные и каллиграфические"],
  ["monospace", "Моноширинные"], ["decorative", "Декоративные"],
  ["symbol", "Символьные"], ["unknown", "Не определена"]
];

async function prGetFontMetadata() {
  // The embedded snapshot works even before the GitHub automation is installed.
  const metadata = new Map(Object.entries(PR_EMBEDDED_FONT_METADATA));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch("https://raw.githubusercontent.com/" + PR_FONT_REPO_OWNER + "/" +
      PR_FONT_REPO_NAME + "/" + PR_FONT_REPO_BRANCH + "/font-catalog.json", {
      cache: "no-store", signal: controller.signal
    });
    if (!response.ok) return metadata;
    const catalog = await response.json();
    if (catalog.version !== 1 || !Array.isArray(catalog.fonts)) return metadata;
    for (const item of catalog.fonts) {
      if (/^[a-f0-9]{40}$/.test(item.sha) &&
          typeof item.cyrillic === "boolean" && typeof item.latin === "boolean" &&
          PR_FONT_CATEGORIES.some(([id]) => id === item.category)) metadata.set(item.sha, item);
    }
  } catch (_) { /* Preserve the checked snapshot on offline/404/rate limit. */ }
  finally { clearTimeout(timer); }
  return metadata;
}

function prApplyFontFilters(rebuildCategories = true, preferred = prFontSelect.value) {
  const language = prFontLanguage.value;
  const languageItems = [...prFontFiles.values()].filter(item =>
    language === "all" || item[language] === true);
  if (rebuildCategories) {
    const previous = prFontCategorySelect.value;
    prFontCategorySelect.replaceChildren(new Option("Все категории", "all"));
    for (const [id, label] of PR_FONT_CATEGORIES) {
      if (languageItems.some(item => item.category === id))
        prFontCategorySelect.add(new Option(label, id));
    }
    prFontCategorySelect.value = [...prFontCategorySelect.options].some(o => o.value === previous)
      ? previous : "all";
  }
  const category = prFontCategorySelect.value;
  const items = languageItems.filter(item => category === "all" || item.category === category)
    .sort((a, b) => a.name.localeCompare(b.name, "ru", {numeric:true, sensitivity:"base"}));
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.appendChild(new Option(item.name, item.value));
  prFontSelect.replaceChildren(fragment);
  prFontSelect.disabled = !items.length;
  if (items.length) {
    prFontSelect.value = items.some(item => item.value === preferred) ? preferred : items[0].value;
  } else {
    prFontSelect.add(new Option("Нет шрифтов для выбранных фильтров", ""));
  }
  const unverified = [...prFontFiles.values()].some(item => !item.verified);
  prFontFilterNote.textContent = !items.length ? "Попробуйте другой алфавит или категорию." :
    unverified ? "Новые или изменённые шрифты появятся в языковых фильтрах после проверки. Пока они доступны в разделе «Все»." :
    category === "unknown" ? "В этих файлах недостаточно сведений о категории. Поддержка алфавита проверена отдельно." : "";
  prFontStatus.textContent = "";
  prFontRetry.hidden = true;
  prRenderPersonalization();
}
prFontLanguage.addEventListener("change", () => {
  // A new alphabet starts with all its categories, keeping the two-step choice clear.
  prFontCategorySelect.value = "all";
  prApplyFontFilters(true);
});
prFontCategorySelect.addEventListener("change", () => prApplyFontFilters(false));

async function prPopulateFonts() {
  prFontSelect.innerHTML = "";
  prFontFiles.clear();
  prFontLanguage.disabled = true;
  prFontCategorySelect.disabled = true;
  prFontRetry.hidden = true;
  prFontStatus.textContent = "Загружаем список шрифтов…";

  const loadingOption = document.createElement("option");
  loadingOption.textContent = "Загружаем библиотеку шрифтов…";
  loadingOption.disabled = true;
  loadingOption.selected = true;
  prFontSelect.appendChild(loadingOption);
  prFontSelect.disabled = true;

  try {
    const [files, metadata] = await Promise.all([prFetchRepoFonts(), prGetFontMetadata()]);
    files.forEach((file, index) => {
      const checked = metadata.get(file.sha);
      prFontFiles.set(file.path, {
        value: file.path,
        family: "PR_Library_" + index,
        name: prFontDisplayName(file.name),
        downloadUrl: file.download_url,
        category: checked ? checked.category : "unknown",
        cyrillic: checked ? checked.cyrillic : null,
        latin: checked ? checked.latin : null,
        verified: !!checked
      });
    });
    prDefaultFontValue = prFontFiles.has(PR_FONT_DIRECTORY + "/" + PR_DEFAULT_FONT_FILE)
      ? PR_FONT_DIRECTORY + "/" + PR_DEFAULT_FONT_FILE
      : prFontFiles.has(PR_DEFAULT_FONT_FILE) ? PR_DEFAULT_FONT_FILE : (prFontFiles.keys().next().value || "");
    prFontLanguage.disabled = false;
    prFontCategorySelect.disabled = false;
    prApplyFontFilters(true, prDefaultFontValue);
  } catch (error) {
    console.error("GitHub font library:", error);
    prFontFiles.clear();
    prFontStatus.textContent = error.message || "Не удалось загрузить библиотеку.";
    prFontRetry.hidden = false;

    prFontSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Не удалось загрузить библиотеку шрифтов";
    prFontSelect.appendChild(option);
    prFontSelect.disabled = true;

    if (prSelectedFontName) {
      prSelectedFontName.textContent = "Arial";
    }
  }
}

function prGetTracks() {
  return {
    ribbon15: root.querySelector(".pr-ribbon-15 .pr-print-track"),
    ribbon25: root.querySelector(".pr-ribbon-25 .pr-print-track")
  };
}

function prCurrentText() {
  return prCustomText.value.trim() || "ВАША НАДПИСЬ";
}

function prBuildLogoSlots(count) {
  const tracks = prGetTracks();
  [tracks.ribbon15, tracks.ribbon25].forEach(track => {
    if (!track) return;
    track.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const slot = document.createElement("span");
      slot.className = "pr-logo";
      track.appendChild(slot);
    }
  });
}

function prRenderPersonalization() {
  const renderVersion = ++prFontRenderVersion;
  const slots = root.querySelectorAll(".pr-logo");

  if (prMode === "svg" && prUploadedSvgMarkup) {
    slots.forEach(element => {
      element.classList.remove("is-text");
      element.classList.add("has-svg");
      element.style.fontFamily = "";
      element.style.fontSize = "";
      element.innerHTML = prUploadedSvgMarkup;
    });
  } else if (prMode === "svg") {
    slots.forEach(element => {
      element.classList.remove("has-svg", "is-text");
      element.style.width = "";
      element.style.height = "";
      element.style.fontFamily = "Arial, sans-serif";
      element.style.fontSize = "";
      element.textContent = "ВАШ ЛОГОТИП";
    });
  } else {
    const text = prCurrentText();
    const fontValue = prFontSelect.value;
    const fontItem = prFontFiles.get(fontValue);
    const fontName = fontItem ? fontItem.name : "Arial";

    if (prSelectedFontName) prSelectedFontName.textContent = fontItem ? fontName : "Не выбран";

    // Текст обновляем сразу, чтобы ввод никогда не тормозил.
    slots.forEach(element => {
      element.classList.remove("has-svg");
      element.classList.add("is-text");
      element.style.width = "";
      element.style.height = "";
      element.style.fontWeight = "400";
      element.textContent = text;
    });
    prFontPreview.textContent = text;
    prApplyLogoSize();

    if (!fontItem) {
      slots.forEach(element => element.style.fontFamily = "Arial, sans-serif");
      prFontPreview.style.fontFamily = "Arial, sans-serif";
      return;
    }

    const requestedValue = fontValue;

    // Если уже загружен — показываем мгновенно.
    prFontRetry.hidden = true;
    if (fontItem.loadedFamily) {
      prFontStatus.textContent = "";
      prFontPreview.style.fontWeight = "400";
      const cssFamily = '"' + fontItem.loadedFamily + '", Arial, sans-serif';
      slots.forEach(element => element.style.fontFamily = cssFamily);
      prFontPreview.style.fontFamily = cssFamily;
      // Форсируем repaint в Tilda/Chrome.
      void prFontPreview.offsetWidth;
      prApplyLogoSize();
      return;
    }

    // Важно: НЕ назначаем несуществующее family заранее.
    // Сначала реально загружаем WOFF2, потом применяем его к превью.
    prFontStatus.textContent = "Загружаем «" + fontName + "»…";
    slots.forEach(element => element.style.fontFamily = "Arial, sans-serif");
    prFontPreview.style.fontFamily = "Arial, sans-serif";
    prLoadRepoFont(requestedValue)
      .then(loadedFamily => {
        if (!loadedFamily) return;
        if (renderVersion !== prFontRenderVersion || prMode !== "text" ||
            (prFontSelect.value || prDefaultFontValue) !== requestedValue) return;

        prFontStatus.textContent = "";
        const cssFamily = '"' + loadedFamily + '", Arial, sans-serif';

        root.querySelectorAll(".pr-logo.is-text").forEach(element => {
          element.style.fontFamily = cssFamily;
          element.style.fontWeight = "400";
        });

        prFontPreview.style.fontFamily = cssFamily;
        prFontPreview.style.fontWeight = "400";

        // Принудительный repaint: выбранный шрифт сразу виден в preview.
        void prFontPreview.offsetWidth;
        prFontPreview.style.transform = "translateZ(0)";
        requestAnimationFrame(() => {
          prFontPreview.style.transform = "";
          prApplyLogoSize();
        });
      })
      .catch(() => {
        if (renderVersion !== prFontRenderVersion || prMode !== "text" ||
            (prFontSelect.value || prDefaultFontValue) !== requestedValue) return;
        prFontStatus.textContent = "Не удалось загрузить «" + fontName + "». Временно показан Arial.";
        prFontRetry.hidden = false;
        slots.forEach(element => element.style.fontFamily = "Arial, sans-serif");
        prFontPreview.style.fontFamily = "Arial, sans-serif";
      });
  }

  prApplyLogoSize();
}

function prApplyLogoSize() {
  const percent = Number(prLogoSize.value);
  prLogoSizeValue.textContent = percent + "%";

  if (prMode === "text") {
    const applyText = (selector, basePx) => {
      const ribbon = root.querySelector(selector);
      if (!ribbon) return;
      ribbon.querySelectorAll(".pr-logo.is-text").forEach(element => {
        element.style.fontSize = (basePx * percent / 70) + "px";
      });
    };
    applyText(".pr-ribbon-15", 13);
    applyText(".pr-ribbon-25", 19);
    return;
  }

  if (!prUploadedSvgMarkup) return;

  const applySvg = (ribbonSelector, maxFraction) => {
    const ribbon = root.querySelector(ribbonSelector);
    if (!ribbon) return;
    const ribbonHeight = ribbon.getBoundingClientRect().height;
    const logoHeight = ribbonHeight * maxFraction * percent / 100;
    const logoWidth = logoHeight * prUploadedSvgRatio;

    ribbon.querySelectorAll(".pr-logo.has-svg").forEach(element => {
      element.style.height = logoHeight + "px";
      element.style.width = logoWidth + "px";
      element.style.flex = "0 0 auto";
      const svg = element.querySelector("svg");
      if (svg) {
        svg.style.display = "block";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.maxWidth = "none";
        svg.style.maxHeight = "none";
      }
    });
  };

  applySvg(".pr-ribbon-15", 9 / 15);
  applySvg(".pr-ribbon-25", 19 / 25);
}

function prRepeatLabel(count) {
  return count + " " + (count === 1 ? "повтор" : (count >= 2 && count <= 4 ? "повтора" : "повторов"));
}

function prApplyRepeat() {
  const count = Number(prLogoRepeat.value);
  prLogoRepeatValue.textContent = prRepeatLabel(count);
  prBuildLogoSlots(count);
  prRenderPersonalization();
}

function prSetMode(mode) {
  prMode = mode;
  root.querySelectorAll(".pr-mode-button").forEach(button => {
    button.classList.toggle("active", button.dataset.prMode === mode);
  });
  prTextPanel.classList.toggle("active", mode === "text");
  prSvgPanel.classList.toggle("active", mode === "svg");
  prSizeLabel.textContent = mode === "text" ? "Размер текста" : "Размер логотипа";
  prRenderPersonalization();
}

root.querySelectorAll(".pr-mode-button").forEach(button => {
  button.addEventListener("click", () => prSetMode(button.dataset.prMode));
});

prCustomText.addEventListener("input", prRenderPersonalization);
prFontSelect.addEventListener("change", () => {
  prRenderPersonalization();
});
prLogoSize.addEventListener("input", prApplyLogoSize);
prLogoRepeat.addEventListener("input", prApplyRepeat);

if (prLogoUpload) {
  prLogoUpload.addEventListener("change", event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (prLogoFileName) prLogoFileName.textContent = file.name;

    const isSvg = /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
    if (!isSvg) {
      alert("Пожалуйста, выберите файл SVG.");
      prLogoUpload.value = "";
      if (prLogoFileName) prLogoFileName.textContent = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(reader.result), "image/svg+xml");
        const svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
          throw new Error("Invalid SVG");
        }

        svg.querySelectorAll("script, foreignObject").forEach(node => node.remove());
        const originalWidth = svg.getAttribute("width");
        const originalHeight = svg.getAttribute("height");

        if (!svg.getAttribute("viewBox")) {
          const w = parseFloat(originalWidth);
          const h = parseFloat(originalHeight);
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            svg.setAttribute("viewBox", "0 0 " + w + " " + h);
          }
        }

        svg.removeAttribute("width");
        svg.removeAttribute("height");
        const viewBox = svg.getAttribute("viewBox");
        if (viewBox) {
          const vb = viewBox.trim().split(/[\s,]+/).map(Number);
          if (vb.length === 4 && Number.isFinite(vb[2]) && Number.isFinite(vb[3]) && vb[2] > 0 && vb[3] > 0) {
            prUploadedSvgRatio = vb[2] / vb[3];
          }
        }

        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        prUploadedSvgMarkup = new XMLSerializer().serializeToString(svg);
        prSetMode("svg");
      } catch(error) {
        console.error("SVG logo preview:", error);
        alert("Не удалось открыть этот SVG. Попробуйте другой SVG-файл.");
      }
    };
    reader.onerror = () => alert("Не удалось прочитать SVG-файл.");
    reader.readAsText(file);
  });
}

prPopulateFonts();
prBuildLogoSlots(5);
prSetMode("text");


/* =========================================================
   GITHUB

   Репозиторий:
   dashusav-lab/photo1525
========================================================= */

const GITHUB_OWNER =
  "dashusav-lab";

const GITHUB_REPO =
  "photo1525";

const GITHUB_BRANCH =
  "main";


/* =========================================================
   ЦВЕТА ЛЕНТЫ
========================================================= */

const ribbonColors = [

  {
    id:"beige",
    name:"Бежевый",
    color:"#cdb99d"
  },

  {
    id:"white",
    name:"Белая",
    color:"#f4f1e9"
  },

  {
    id:"white-silicone",
    name:"Белый силикон",
    color:"#f7f7f4",
    silicone:true
  },

  {
    id:"pale-pink",
    name:"Бледно-розовый",
    color:"#e6b7bd"
  },

  {
    id:"burgundy",
    name:"Бордовый",
    color:"#751c31"
  },

  {
    id:"light-blue",
    name:"Голубой",
    color:"#69a8cc"
  },

  {
    id:"yellow",
    name:"Жёлтый",
    color:"#e6c42f"
  },

  {
    id:"green",
    name:"Зелёный",
    color:"#28764c"
  },

  {
    id:"red",
    name:"Красный",
    color:"#c92834"
  },

  {
    id:"cream",
    name:"Кремовый",
    color:"#e5d0ad"
  },

  {
    id:"milky",
    name:"Молочный",
    color:"#eee3cf"
  },

  {
    id:"sky-blue",
    name:"Небесно-голубой",
    color:"#9fc8dd"
  },

  {
    id:"olive",
    name:"Оливковый",
    color:"#818258"
  },

  {
    id:"orange",
    name:"Оранжевый",
    color:"#e97b2c"
  },

  {
    id:"dusty-rose",
    name:"Пыльная роза",
    color:"#a75b70"
  },

  {
    id:"pink-silicone",
    name:"Розовый силикон",
    color:"#d7839c",
    silicone:true
  },

  {
    id:"light-green",
    name:"Светло-зелёный",
    color:"#82b986"
  },

  {
    id:"gray",
    name:"Серый",
    color:"#777a7e"
  },

  {
    id:"blue",
    name:"Синий",
    color:"#244f91"
  },

  {
    id:"purple",
    name:"Фиолетовый",
    color:"#673c83"
  },

  {
    id:"fuchsia",
    name:"Фуксия",
    color:"#bb2970"
  },

  {
    id:"black",
    name:"Чёрная",
    color:"#171717"
  },

  {
    id:"black-silicone",
    name:"Чёрный силикон",
    color:"#242424",
    silicone:true
  },

  {
    id:"chocolate",
    name:"Шоколадный",
    color:"#5b352c"
  }

];


/* =========================================================
   ЦВЕТА НАНЕСЕНИЯ
========================================================= */

const printColors = [

  {
    id:"gold",
    name:"Золото",
    color:"#d5ad52"
  },

  {
    id:"silver",
    name:"Серебро",
    color:"#cbd0d4"
  },

  {
    id:"purple",
    name:"Фиолетовый",
    color:"#703e8b"
  },

  {
    id:"black",
    name:"Чёрный",
    color:"#151515"
  },

  {
    id:"pink",
    name:"Розовый",
    color:"#d95791"
  },

  {
    id:"white",
    name:"Белый",
    color:"#ffffff"
  },

  {
    id:"green-metallic",
    name:"Зелёный металлик",
    color:"#39855d"
  },

  {
    id:"red-metallic",
    name:"Красный металлик",
    color:"#b82e39"
  },

  {
    id:"blue-metallic",
    name:"Синий металлик",
    color:"#32629b"
  },

  {
    id:"chocolate",
    name:"Шоколадный",
    color:"#59362d"
  },

  {
    id:"orange",
    name:"Оранжевый",
    color:"#e66d27"
  }

];


/* =========================================================
   STATE
========================================================= */

const state = {
  ribbon:"beige",
  print:"gold"
};

const galleryCache =
  new Map();

let galleryPhotos = [];

let photoIndex = 0;


/* =========================================================
   HELPERS
========================================================= */

function find(list,id) {

  return list.find(
    item => item.id === id
  );

}

function galleryKey() {

  return (
    state.ribbon +
    "-" +
    state.print
  );

}


/* =========================================================
   PREVIEW
========================================================= */

function renderPreview() {

  const ribbon =
    find(
      ribbonColors,
      state.ribbon
    );

  const print =
    find(
      printColors,
      state.print
    );


  root.style.setProperty(
    "--ribbon-color",
    ribbon.color
  );

  root.style.setProperty(
    "--print-color",
    print.color
  );


  [
    "prRibbon15",
    "prRibbon25"
  ].forEach(id => {

    const element =
      document.getElementById(id);

    element.classList.toggle(
      "silicone",
      !!ribbon.silicone
    );

  });

}


/* =========================================================
   COLOR BUTTONS
========================================================= */

function renderChoices(
  containerId,
  list,
  stateKey
) {

  const container =
    document.getElementById(
      containerId
    );

  container.innerHTML = "";


  list.forEach(item => {

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "pr-choice" +
      (
        state[stateKey] === item.id
          ? " active"
          : ""
      );


    const swatch =
      document.createElement(
        "span"
      );

    swatch.className =
      "pr-swatch";

    swatch.style.setProperty(
      "--swatch",
      item.color
    );


    const name =
      document.createElement(
        "span"
      );

    name.className =
      "pr-choice-name";

    name.textContent =
      item.name;


    button.append(
      swatch,
      name
    );


    button.addEventListener(
      "click",
      () => {

        state[stateKey] =
          item.id;


        container
          .querySelectorAll(
            ".pr-choice"
          )
          .forEach(element => {

            element.classList.remove(
              "active"
            );

          });


        button.classList.add(
          "active"
        );


        renderPreview();

        renderGallery();

      }
    );


    container.appendChild(
      button
    );

  });

}


/* =========================================================
   GITHUB PHOTOS
========================================================= */

async function getPhotos(key) {

  if (
    galleryCache.has(key)
  ) {

    return galleryCache.get(
      key
    );

  }


  const url =
    "https://api.github.com/repos/" +
    GITHUB_OWNER +
    "/" +
    GITHUB_REPO +
    "/contents/" +
    encodeURIComponent(key) +
    "?ref=" +
    encodeURIComponent(
      GITHUB_BRANCH
    );


  const response =
    await fetch(
      url,
      {
        headers:{
          Accept:
            "application/vnd.github+json"
        }
      }
    );


  if (
    response.status === 404
  ) {

    galleryCache.set(
      key,
      []
    );

    return [];

  }


  if (!response.ok) {

    throw new Error(
      "GitHub HTTP " +
      response.status
    );

  }


  const files =
    await response.json();


  if (
    !Array.isArray(files)
  ) {

    return [];

  }


  const imageExtensions =
    /\.(jpg|jpeg|png|webp|gif)$/i;


  const photos =
    files

      .filter(file => {

        return (
          file.type === "file" &&
          imageExtensions.test(
            file.name
          )
        );

      })

      .sort((a,b) => {

        return a.name.localeCompare(
          b.name,
          undefined,
          {
            numeric:true,
            sensitivity:"base"
          }
        );

      })

      .map(file =>
        file.download_url
      );


  galleryCache.set(
    key,
    photos
  );


  return photos;

}


/* =========================================================
   GALLERY
========================================================= */

async function renderGallery() {

  const content =
    document.getElementById(
      "prGalleryContent"
    );

  const combination =
    document.getElementById(
      "prCombination"
    );


  const ribbon =
    find(
      ribbonColors,
      state.ribbon
    );

  const print =
    find(
      printColors,
      state.print
    );

  const key =
    galleryKey();


  combination.textContent =
    ribbon.name +
    " + " +
    print.name;


  content.innerHTML = `
    <div class="pr-gallery-status">

      <span class="pr-loader"></span>

      <strong>
        Загружаем примеры
      </strong>

      Ищем фотографии выбранного сочетания.

    </div>
  `;


  try {

    const photos =
      await getPhotos(key);


    if (
      key !== galleryKey()
    ) {
      return;
    }


    galleryPhotos =
      photos;


    if (!photos.length) {

      content.innerHTML = `
        <div class="pr-gallery-status">

          <strong>
            Для этого сочетания пока нет фотографий
          </strong>

          Вы можете посмотреть сочетание цветов
          на превью выше.

        </div>
      `;

      return;

    }


    const grid =
      document.createElement(
        "div"
      );

    grid.className =
      "pr-gallery";


    photos.forEach(
      (url,index) => {

        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "pr-photo";


        const img =
          document.createElement(
            "img"
          );

        img.src =
          url;

        img.loading =
          "lazy";

        img.decoding =
          "async";

        img.alt =
          ribbon.name +
          " + " +
          print.name;


        button.appendChild(
          img
        );


        button.addEventListener(
          "click",
          () => {

            openPhoto(
              index
            );

          }
        );


        grid.appendChild(
          button
        );

      }
    );


    content.innerHTML =
      "";

    content.appendChild(
      grid
    );

  }

  catch(error) {

    console.error(
      "Packaging ribbon gallery:",
      error
    );


    content.innerHTML = `
      <div class="pr-gallery-status">

        <strong>
          Не удалось загрузить фотографии
        </strong>

        Попробуйте немного позже.

      </div>
    `;

  }

}


/* =========================================================
   LIGHTBOX
========================================================= */

const lightbox =
  document.getElementById(
    "prLightbox"
  );

const lightboxImage =
  document.getElementById(
    "prLightboxImage"
  );


function openPhoto(index) {

  if (
    !galleryPhotos.length
  ) {
    return;
  }


  photoIndex =
    index;


  updatePhoto();


  lightbox.classList.add(
    "open"
  );


  document.body.style.overflow =
    "hidden";

}


function updatePhoto() {

  if (
    !galleryPhotos.length
  ) {
    return;
  }


  lightboxImage.src =
    galleryPhotos[
      photoIndex
    ];

}


function closePhoto() {

  lightbox.classList.remove(
    "open"
  );


  lightboxImage.removeAttribute(
    "src"
  );


  document.body.style.overflow =
    "";

}


function prevPhoto() {

  if (
    !galleryPhotos.length
  ) {
    return;
  }


  photoIndex--;


  if (
    photoIndex < 0
  ) {

    photoIndex =
      galleryPhotos.length - 1;

  }


  updatePhoto();

}


function nextPhoto() {

  if (
    !galleryPhotos.length
  ) {
    return;
  }


  photoIndex++;


  if (
    photoIndex >=
    galleryPhotos.length
  ) {

    photoIndex = 0;

  }


  updatePhoto();

}


/* =========================================================
   LIGHTBOX EVENTS
========================================================= */

document
  .getElementById(
    "prClose"
  )
  .addEventListener(
    "click",
    closePhoto
  );


document
  .getElementById(
    "prPrev"
  )
  .addEventListener(
    "click",
    prevPhoto
  );


document
  .getElementById(
    "prNext"
  )
  .addEventListener(
    "click",
    nextPhoto
  );


lightbox.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      lightbox
    ) {

      closePhoto();

    }

  }
);


document.addEventListener(
  "keydown",
  event => {

    if (
      !lightbox.classList.contains(
        "open"
      )
    ) {
      return;
    }


    if (
      event.key === "Escape"
    ) {

      closePhoto();

    }


    if (
      event.key === "ArrowLeft"
    ) {

      prevPhoto();

    }


    if (
      event.key === "ArrowRight"
    ) {

      nextPhoto();

    }

  }
);


/* =========================================================
   RESET
========================================================= */

document
  .getElementById(
    "prReset"
  )
  .addEventListener(
    "click",
    () => {

      state.ribbon =
        "beige";

      state.print =
        "gold";

      prUploadedSvgMarkup = "";
      prUploadedSvgRatio = 2.5;
      prLogoSize.value = "70";
      prLogoRepeat.value = "5";
      prLogoSizeValue.textContent = "70%";
      prLogoRepeatValue.textContent = "5 повторов";
      prCustomText.value = "ВАША НАДПИСЬ";
      prFontLanguage.value = "all";
      prFontCategorySelect.value = "all";
      prApplyFontFilters(true, prDefaultFontValue);
      if (prLogoUpload) prLogoUpload.value = "";
      if (prLogoFileName) prLogoFileName.textContent = "";
      prBuildLogoSlots(5);
      prSetMode("text");

      init();

    }
  );


/* =========================================================
   INIT
========================================================= */

function init() {

  renderChoices(
    "prRibbonColors",
    ribbonColors,
    "ribbon"
  );


  renderChoices(
    "prPrintColors",
    printColors,
    "print"
  );


  renderPreview();

  renderGallery();

}


init();


})();
