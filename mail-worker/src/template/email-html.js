import domainUtils from '../utils/domain-uitls';

// 邮件正文完全由发件人控制，而这个页面由 Worker 吐在自己的域名下、与 SPA 同源，
// 一旦执行脚本就能读走 localStorage 里的 JWT。
//
// 消毒放在浏览器里做，且只解析一次：DOMParser 解析出惰性文档 -> 在活 DOM 上清洗
// -> 把节点直接搬进 shadow root。全程不做「序列化再 innerHTML」的往返，
// 因此不存在服务端解析器与浏览器解析器之间的差异（noscript / xmp / foreign content
// 这类 mXSS 正是靠这种差异绕过黑名单的）。
export default function emailHtmlTemplate(html, domain) {

	html = String(html).replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	const safeHtmlJson = JSON.stringify(html).replace(/</g, '\\u003C');

	return `<!DOCTYPE html>
<html lang='en' >
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        .content-box {
        		padding: 15px 10px;
            width: 100%;
            height: 100%;
            overflow: auto; /* 改为 auto 允许滚动 */
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .content-html {
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <div class='content-box'>
        <div id='container' class='content-html'></div>
    </div>

    <script>

        var SHADOW_STYLE = [
            ':host { all: initial; width: 100%; height: 100%;',
            "  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;",
            '  font-size: 14px; line-height: 1.5; color: #13181D; word-break: break-word; overflow: auto; }',
            'h1, h2, h3, h4 { font-size: 18px; font-weight: 700; }',
            'p { margin: 0; }',
            'a { text-decoration: none; color: #0E70DF; }',
            '.shadow-content { background: #FFFFFF; width: fit-content; height: fit-content; min-width: 100%; }',
            'img:not(table img) { max-width: 100% !important; height: auto !important; }'
        ].join('\\n');

        // 整棵子树一起删掉的：这些标签本身就是执行/加载载体，内容也没有阅读价值
        var DROP_TAGS = 'script,iframe,object,embed,base,meta,link,noscript,template,animate,set,animateTransform,animateMotion';
        // 只脱壳、保留子节点的：正文常被包在 form 里（问卷/退订邮件），整棵删会把邮件删空
        var UNWRAP_TAGS = 'form';
        var URL_ATTRS = ['href', 'src', 'action', 'formaction', 'data', 'poster', 'values', 'from', 'to'];

        function isBadUrl(value) {
            var v = String(value || '').replace(/[^!-~]/g, '').toLowerCase();
            return v.indexOf('javascript:') === 0 || v.indexOf('vbscript:') === 0 || v.indexOf('data:text/html') === 0;
        }

        function sanitize(root) {

            root.querySelectorAll(DROP_TAGS).forEach(function (el) {
                el.remove();
            });

            root.querySelectorAll(UNWRAP_TAGS).forEach(function (el) {
                var parent = el.parentNode;
                if (!parent) return;
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                el.remove();
            });

            root.querySelectorAll('*').forEach(function (el) {
                el.getAttributeNames().forEach(function (name) {
                    var lower = name.toLowerCase();
                    // on* 事件属性，含 xlink/xml 命名空间前缀的写法
                    if (lower.indexOf('on') === 0 || lower.indexOf(':on') > -1) {
                        el.removeAttribute(name);
                        return;
                    }
                    // href / xlink:href / xml:href 等都要查，命名空间前缀不固定
                    var isUrlAttr = URL_ATTRS.indexOf(lower) > -1 || lower.indexOf(':href') > -1;
                    if (isUrlAttr && isBadUrl(el.getAttribute(name))) {
                        el.removeAttribute(name);
                    }
                });
            });
        }

        function renderHTML(html) {

            var container = document.getElementById('container');
            var shadowRoot = container.attachShadow({ mode: 'open' });

            // 唯一一次解析。DOMParser 产出的文档是惰性的：不加载资源、不执行脚本
            var doc = new DOMParser().parseFromString(html, 'text/html');
            sanitize(doc);

            var style = document.createElement('style');
            style.textContent = SHADOW_STYLE;

            var holder = document.createElement('div');
            holder.className = 'shadow-content';

            // 走 style.cssText 交给 CSS 解析器，值里的 } 或 :host 只会被当成非法声明丢弃，
            // 无法闭合规则块逃到外面去（拼字符串进 <style> 就会被逃出来）
            if (doc.body) {
                holder.style.cssText = doc.body.getAttribute('style') || '';
            }

            // head 里的 <style> 是邮件自带排版，要保留
            doc.querySelectorAll('head style').forEach(function (el) {
                holder.appendChild(el);
            });

            // 直接搬节点，不做序列化 -> 不会被重新解析
            if (doc.body) {
                while (doc.body.firstChild) {
                    holder.appendChild(doc.body.firstChild);
                }
            }

            shadowRoot.appendChild(style);
            shadowRoot.appendChild(holder);

            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {

            if (!shadowRoot || !container) return;

            var shadowContent = shadowRoot.querySelector('.shadow-content');

            if (!shadowContent) return;

            var parentWidth = container.offsetWidth;
            var childWidth = shadowContent.scrollWidth;

            // 邮件把 .shadow-content 设成 position:fixed 时宿主会塌缩成 0 宽，
            // 不拦住就会算出 zoom:0 让整封邮件不可见
            if (childWidth === 0 || parentWidth === 0) return;

            shadowRoot.host.style.zoom = parentWidth / childWidth;
        }

        renderHTML(${safeHtmlJson});
    </script>
</body>
</html>`
}
