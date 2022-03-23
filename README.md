# umi-plugin-convention-routes-v4

[![NPM version](https://img.shields.io/npm/v/umi-plugin-convention-routes-v4.svg?style=flat)](https://npmjs.org/package/umi-plugin-convention-routes-v4) [![NPM downloads](http://img.shields.io/npm/dm/umi-plugin-convention-routes-v4.svg?style=flat)](https://npmjs.org/package/umi-plugin-convention-routes-v4)

这是一个为`约定式路由`功能而做的插件，适用于`umijs@4.x`

它会代替`umijs`原有的`约定式路由`逻辑。

如果你要寻找适用于`umijs@3.x`的该插件，请查看[https://www.npmjs.com/package/umi-plugin-convention-routes](https://www.npmjs.com/package/umi-plugin-convention-routes)

## 更新记录

### 1.0.0

- 初始版本

## Why

关于编写该插件的原因，我在上个版本的插件的[Readme](https://www.npmjs.com/package/umi-plugin-convention-routes)中已经写的比较详细了。感兴趣可以点进去查看。

## Convention

本插件的路由约定规则如下。

### Entry

页面的入口文件必须为`index`，如`src/pages/home/index.tsx`，当然我还是推荐三件套（index + 页面本体 + 样式），这样更便于开发时查找文件及 `css-module` 自动命名。我相信你不会希望在调试样式的时候看到的都是 `index_xxxx`。

我们推荐使用命令行工具一件生成上面所说的`三件套`。

> TODO 开放命令行工具

### Pathname

路径必须使用 小写字母 + `-` 构成，如果写了大写字母，默认是不被识别的。

例如，该文件`src/pages/Home/index.tsx`就无法被识别为路由。

如果你的目录名称由多个单词构成，请使用 `-` 分隔，如 `src/pages/user-list/index.tsx`。

### Nested Routing

本插件遵循了 `umi@2/3` 的嵌套路由习惯，在某个页面目录下建立 `_layout.tsx` 文件，可以让 `layout` 中的内容作用于所有子路由中。

例如，`src/pages/home/_layout.tsx` 中编写的内容，会在 `/home` 以及 `/home/*` 路由中生效。其中 `layout` 组件的 `children` 代表子路由匹配到的页面组件。（在`react-router@6`中，`children` 的默认值为 `<Outlet />`

下面是一个 `layout` 文件的编写示例：

```jsx
// src/pages/home/_layout.tsx

// 该文件会被包含在 /home 及 /home/* 页面中
export default (props) => {
  const {children} = props
  return (
    <div>
      <div>This is Layout</div>
      {children}
    </div>
  );
}
```

### Dynamic Routing

你可以将路由中间的目录命名为 `[xxx]` 作为动态路由。

例如：`src/pages/users/[id]/index.tsx` 将转换为路由 `/users/:id`。

你可以使用 `useParams` 获取该动态数据：

```tsx
// src/pages/users/[id]/index.tsx
import {useParams} from 'react-router';

export default () => {
  // 当访问 /users/123 时，这里的 id === '123'
  const {id} = useParams<'id'>();
  return <div>{id}/div>;
}
```

### Exclude

部分特殊目录下的内容不会被识别为路由，目前会忽略的目录为 `components`, `models`, `services`, `layouts`。

例如，`src/pages/home/components/*` 下的所有内容都无法识别为路由。

### 404

建立 `src/pages/404.tsx` 后，当访问到无法匹配的路由时，将会展示该 404 页面的内容。

## Install

```bash
# npm or yarn
$ npm install umi-plugin-convention-routes-v4 -D
```

## Usage

Configure in `.umirc.js`,

```js
export default {
  plugins: ['umi-plugin-convention-routes-v4'],
};
```

## Options

Configure in `.umirc.js`,

```typescript
export default {
  conventionRoutesConfig: {
    pageRoot: 'src/pages',
    filter: (obj) => {
      return obj.name === 'index' || obj.name === '_layout';
    },
    includes: [],
    excludes: [/[\\/](components|models|services|layouts)[\\/]/],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue'],
    modifyRoutes: (routes: RouteConfig[]) => routes,
  },
};
```

## LICENSE

MIT
