// 背景资源统一配置。
// 当前可以使用项目内相对路径；迁移到 Cloudflare 后，直接替换为完整的 HTTPS URL。
// 示例：'https://assets.example.com/event-earth/ayanga/earth.jpg'
const backgroundAsset = (path) => new URL(`../../background/people/${path}`, import.meta.url).href;

export const BACKGROUND_CONFIG = {
  ayanga: {
    earth: backgroundAsset('ayanga/earth.jpg'),
    chinaMap: backgroundAsset('ayanga/china-map.jpg'),
    fallbackCategory: backgroundAsset('ayanga/category.jpg'),
    categories: {
      musical: backgroundAsset('ayanga/categories/musical.jpg'),
      drama: backgroundAsset('ayanga/categories/drama.jpg'),
      concert: backgroundAsset('ayanga/categories/concert.jpg'),
      film: backgroundAsset('ayanga/categories/film.jpg'),
      gala: backgroundAsset('ayanga/categories/gala.jpg'),
      variety: backgroundAsset('ayanga/categories/variety.jpg'),
      ost: backgroundAsset('ayanga/categories/ost.jpg'),
      single: backgroundAsset('ayanga/categories/single.jpg'),
      business: backgroundAsset('ayanga/categories/business.jpg'),
    },
  },
  zhengyunlong: {
    earth: backgroundAsset('zhengyunlong/earth.jpg'),
    chinaMap: backgroundAsset('zhengyunlong/china-map.jpg'),
    fallbackCategory: backgroundAsset('zhengyunlong/category.jpg'),
    categories: {
      musical: backgroundAsset('zhengyunlong/categories/musical.jpg'),
      drama: backgroundAsset('zhengyunlong/categories/drama.jpg'),
      concert: backgroundAsset('zhengyunlong/categories/concert.jpg'),
      film: backgroundAsset('zhengyunlong/categories/film.jpg'),
      gala: backgroundAsset('zhengyunlong/categories/gala.jpg'),
      variety: backgroundAsset('zhengyunlong/categories/variety.jpg'),
      ost: backgroundAsset('zhengyunlong/categories/ost.jpg'),
      single: backgroundAsset('zhengyunlong/categories/single.jpg'),
      business: backgroundAsset('zhengyunlong/categories/business.jpg'),
    },
  },
};

export function backgroundsFor(personId) {
  const config = BACKGROUND_CONFIG[personId];
  if (!config) throw new Error(`Missing background configuration for person: ${personId}`);

  return {
    earth: config.earth,
    chinaMap: config.chinaMap,
    category: config.fallbackCategory,
    categories: config.categories,
  };
}
