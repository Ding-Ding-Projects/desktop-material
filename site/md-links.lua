-- Rewrites intra-repository Markdown links so the rendered GitHub Pages docs
-- navigate between their HTML counterparts instead of pointing at raw .md
-- files or GitHub wiki slugs.
local function rewrite(target)
  -- Absolute URLs, in-page anchors, and protocol-relative URLs are untouched.
  if target:match('^%a[%w+.-]*:') or target:match('^#') or target:match('^//') then
    return target
  end
  local path, fragment = target:match('^([^#]*)(#?.*)$')
  if path == nil or path == '' then
    return target
  end
  if path:match('%.md$') then
    path = path:gsub('README%.md$', 'index.html'):gsub('%.md$', '.html')
  elseif not path:match('%.%w+$') and not path:match('/$') then
    -- Wiki-style extensionless links (e.g. "User-Guide") map to their page.
    path = path .. '.html'
  end
  return path .. fragment
end

function Link(el)
  el.target = rewrite(el.target)
  return el
end
