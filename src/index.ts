import { join } from 'path';
import fs from 'fs';
import { scanRoutes } from 'routes-watcher';
import { IApi, IRoute } from 'umi';

type RevMapOptions<T> = {

  /** 子节点的 key */
  childKey?: string;

  /** 是否优先遍历子节点 */
  childrenFirst?: boolean;
  parent?: T;
};


/**
 * 遍历树状结构
 * @param data 树状数据
 * @param callback 返回值处理
 * @param options 配置
 */
function revMap<T extends Object, R extends Object>(
  data: T[],
  callback: (d: T, parent: T | undefined, index: number) => R | undefined,
  options: RevMapOptions<T> = {},
): R[] {
  const { childrenFirst, childKey = 'children', parent } = options;
  return data.map((datum, index) => {
    if (!datum) return datum; // error object
    const children = datum[childKey] as T[] | undefined;
    let newDatum: R | undefined;
    if (childrenFirst) {
      let newChildren: R[] = [];
      if (Array.isArray(children)) {
        newChildren = revMap(children, callback, { ...options, parent: datum });
      }
      newDatum = callback(
        {
          ...datum,
          [childKey]: newChildren,
        },
        parent,
        index,
      );
    } else {
      newDatum = callback({ ...datum }, parent, index);
      if (newDatum && Array.isArray(children)) {
        // @ts-expect-error
        newDatum['children'] = revMap(children, callback, { ...options, parent: newDatum });
      }
    }

    return (newDatum ?? datum) as R;
  });
}

type RouteConfig =
  | {
  children: RouteConfig[];
  [key: string]: unknown;
}
  | IRoute;

function sortDynamicRoutes(arr: RouteConfig[] | undefined): IRoute[] {
  if (!arr) {
    return [];
  }
  return arr
    .map((r) => {
      if (Array.isArray(r.children) && r.children.length > 0) {
        return {
          ...r,
          children: sortDynamicRoutes(r.children),
        };
      }
      return r;
    })
    .sort((a, b) => {
      const dynA = a.path?.indexOf(':') ?? -1;
      const dynB = b.path?.indexOf(':') ?? -1;
      return dynA - dynB;
    });
}

export default (api: IApi) => {
  api.describe({
    key: 'conventionRoutesConfig',
    config: {
      schema(joi) {
        return joi.object({
          /** 页面根目录 */
          pageRoot: joi.string(),

          /** 路由过滤器 */
          filter: joi.function(),
          componentPath: joi.function(),
          extensions: joi.array().items(joi.string()),
          includes: joi.array().items(joi.object().instance(RegExp)),
          excludes: joi.array().items(joi.object().instance(RegExp)),

          /** 完成扫描路由后的提示 */
          successTips: joi.string(),

          /** 对生成的路由做一次整体调整 */
          modifyRoutes: joi.function(),
        });
      },
    },
  });

  let lastRoutesOutput = '';
  let lastRoutesConfig: Record<string, IRoute> = {};

  api.modifyRoutes(async (originRoutes) => {
    const has404 =
      fs.existsSync(join(api.paths.absPagesPath, '404.js')) ||
      fs.existsSync(join(api.paths.absPagesPath, '404.tsx')) ||
      fs.existsSync(join(api.paths.absPagesPath, '404.jsx'));

    const { conventionRoutesConfig = {}} = api.config;
    const { successTips = 'Routes updated.', ...otherConventionRoutesConfig } = conventionRoutesConfig;
    const newRoutes = await new Promise<Record<string, IRoute>>((r) => {
      scanRoutes({
        pageRoot: api.paths.absPagesPath,
        childrenKey: 'routes',
        filter: obj => obj.name === 'index' || obj.name === '_layout',
        excludes: [/[\\/](components|models|services|layouts)[\\/]/],
        modifyRoutePath: path => path.split('/').map((p) => {
          if (/\[([^/^\[^\]]+)\]/.test(p)) {
            let name = p.slice(1, p.length - 1);
            if (p.endsWith('$]')) {
              name = name.replace(/\$$/, '?');
            }
            return `:${name}`;
          }
          return p;
        })
          .join('/'),
        ...otherConventionRoutesConfig,
        successTips: '',
        template: '@routerConfig',
        output: (outputStr: string) => {
          if (outputStr !== lastRoutesOutput) {
            // routes changed
            lastRoutesOutput = outputStr;
            const routesTree = sortDynamicRoutes(JSON.parse(outputStr));
            const tmpRes: Record<string, IRoute> = {};
            revMap(routesTree, (route, parent) => {
              let id = route.path;
              if (id === '/') id = '';
              if (route.exact) id += '/index';
              // else id += '/_layout';
              if (id.startsWith('/')) id = id.slice(1);
              let path = route.path === '/' ? route.path : route.path.slice(1);
              if (parent?.id) {
                path = path.replace(`${parent.id}/`, '');
              }
              let file = route.component.replace('@/pages/', '');
              let layoutWritePath = '';
              // isLayout
              if (!route.exact) {
                const tmpFilename = `_layout_${id.replace(/[/:]/g, '__')}.tsx`;
                const layoutPath = join('plugin-convention-routes', tmpFilename);
                const layoutFilePath = join(api.paths.absTmpPath, layoutPath);
                layoutWritePath = layoutPath;
                file = layoutFilePath;
                // add * to layout
                tmpRes[`${id}/*`] = {
                  id: `${id}/*`,
                  path: '*',
                  parentId: id,
                  file: has404 ? '404' : undefined,
                };
              }

              const isIndex = parent && id === `${parent.id}/index`;
              tmpRes[id] = {
                id,
                path: isIndex ? undefined : path,
                file,
                index: !!isIndex,
                isLayout: !route.exact,
                filePath: route.component,
                layoutWritePath,
              };
              if (parent) {
                tmpRes[id].parentId = parent.id;
              } else if (originRoutes['@@/global-layout']) {
                tmpRes[id].parentId = '@@/global-layout';
              }


              return {
                id,
                path,
                file,
              };
            }, { childKey: 'routes' });
            lastRoutesConfig = tmpRes;
            api.logger.info(successTips);
          }
          r(lastRoutesConfig);
        },
        watch: false,
      });
    });

    if (originRoutes['@@/global-layout']) {
      newRoutes['@@/global-layout'] = originRoutes['@@/global-layout'];
    }
    return newRoutes;
  });


  api.onBeforeCompiler(() => {
    Object.values(lastRoutesConfig).forEach((route) => {
      if (route.isLayout && route.layoutWritePath) {
        api.writeTmpFile({
          path: route.layoutWritePath,
          noPluginDir: true,
          content: `import { Outlet } from 'umi';
                  import Layout from '${route.filePath}';
                  export default () => <Layout><Outlet /></Layout>;
                  `,
        });
      }
    });
  });
};
