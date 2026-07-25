import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';

export default function emailHtmlTemplate(html, domain) {

	const { document } = parseHTML(html);
	sanitize(document);

	// body 的拆解放在服务端用解析器做。客户端原来用 /<\/?body[^>]*>/ 正则剥标签，
	// 属性值里出现 > 就会把标签从中间截断，反而把被引号包住的 payload 还原成真标签。
	const bodyEl = document.querySelector('body');
	let bodyStyle = '';

	if (bodyEl) {
		bodyStyle = (bodyEl.getAttribute('style') || '').replace(/[<>"]/g, '');
		const headStyle = Array.from(document.querySelectorAll('head style')).map(el => el.outerHTML).join('');
		html = headStyle + bodyEl.innerHTML;
	} else {
		html = document.toString();
	}

	html = html.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	const safeHtmlJson = JSON.stringify(html).replace(/</g, '\\u003C');
	const safeBodyStyleJson = JSON.stringify(bodyStyle).replace(/</g, '\\u003C');

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

        function renderHTML(html, bodyStyle) {
            const container = document.getElementById('container');
            const shadowRoot = container.attachShadow({ mode: 'open' });

            // body 的剥离与 style 提取已在服务端用解析器完成，这里不再做正则切标签
            const cleanedHtml = html;

            // 渲染内容
            shadowRoot.innerHTML = \`
                <style>
                    :host {
                        all: initial;
                        width: 100%;
                        height: 100%;
                        font-family: Inter, -apple-system, BlinkMacSystemFont,
                                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #13181D;
                        word-break: break-word;
                        overflow: auto; /* 添加滚动 */
                    }

                    h1, h2, h3, h4 {
                        font-size: 18px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0;
                    }

                    a {
                        text-decoration: none;
                        color: #0E70DF;
                    }

                    .shadow-content {
                        background: #FFFFFF;
                        width: fit-content;
                        height: fit-content;
                        min-width: 100%;
                        \${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
                    }

                    img:not(table img) {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                </style>
                <div class="shadow-content">
                    \${cleanedHtml}
                </div>
            \`;

            // 自动缩放
            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {

            if (!shadowRoot || !container) return;

            const parent = container;
            const shadowContent = shadowRoot.querySelector('.shadow-content');

            if (!shadowContent) return;

            const parentWidth = parent.offsetWidth;
            const childWidth = shadowContent.scrollWidth;

            if (childWidth === 0) return;

            const scale = parentWidth / childWidth;

            const hostElement = shadowRoot.host;
            hostElement.style.zoom = scale;
        }

        // 使用示例
        const exampleHtml = ${safeHtmlJson};
        const exampleBodyStyle = ${safeBodyStyleJson};

        // 渲染HTML
        renderHTML(exampleHtml, exampleBodyStyle);
    </script>
</body>
</html>`
}

// 邮件正文是完全不可信的外部输入，这个页面由 Worker 直接吐在自己的域名下，
// 不清洗就是本站源上的存储型 XSS。只删 <script> 不够：innerHTML 本来就不执行
// script，真正的载体是 on* 事件属性和 javascript: 伪协议。
const DANGER_TAGS = 'script,iframe,object,embed,form,base,meta,link';
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href'];

function sanitize(document) {

	document.querySelectorAll(DANGER_TAGS).forEach(el => el.remove());

	document.querySelectorAll('*').forEach(el => {

		for (const name of el.getAttributeNames()) {

			if (name.toLowerCase().startsWith('on')) {
				el.removeAttribute(name);
				continue;
			}

			if (!URL_ATTRS.includes(name.toLowerCase())) {
				continue;
			}

			const value = (el.getAttribute(name) || '').replace(/[^!-~]/g, '').toLowerCase();

			if (value.startsWith('javascript:') || value.startsWith('data:text/html') || value.startsWith('vbscript:')) {
				el.removeAttribute(name);
			}
		}
	});
}
