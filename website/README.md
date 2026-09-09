# Portfolio Website

A plain HTML/CSS/JS personal portfolio site — no build step, no
dependencies. Open `index.html` in a browser and it just works.

## Structure

```
website/
  index.html       all page content/sections
  css/styles.css   theme tokens, layout, responsive rules
  js/main.js       theme toggle, mobile nav, scroll reveal, form demo
  assets/          favicon, images
```

## Running it locally

Just open the file directly:

```bash
open website/index.html        # macOS
xdg-open website/index.html    # Linux
```

Or serve it (needed if you add features like `fetch()` that some
browsers block on `file://`):

```bash
cd website
python3 -m http.server 8000
# visit http://localhost:8000
```

## Customizing

Search `index.html` for `EDIT ME` comments — those mark the spots you'll
want to personalize first:

1. **Hero section** — your name, tagline, and intro (already using
   "Luke Damian" as a placeholder — check it matches how you want your
   name shown).
2. **About** — real bio text and facts list (location, email, etc).
3. **Projects** — replace the three placeholder cards with your actual
   projects. Each `.project-card` has a title, description, tags, and
   links (demo + source).
4. **Skills** — edit the `.pill` lists per group.
5. **Contact** — update the `mailto:` links (in About facts and the
   footer) to your real email.
6. **Rotating hero words** — edit the `roles` array at the top of
   `js/main.js`.
7. **Favicon** — `assets/favicon.svg` is a placeholder "L" mark; swap it
   for your own logo/initials if you like.

## Contact form

The form in `#contact` is currently front-end only — it shows a
confirmation message but doesn't send anything anywhere. To make it
actually deliver messages without running a backend, the easiest options
are:

- **[Formspree](https://formspree.io)** — free tier, just point the
  form's `action` at the endpoint they give you and add
  `method="POST"`.
- **[Netlify Forms](https://www.netlify.com/platform/core/forms/)** — if
  you deploy on Netlify, add `data-netlify="true"` to the `<form>` tag
  and it handles the rest.

## Deploying

This repo includes a GitHub Actions workflow
(`.github/workflows/deploy-pages.yml`) that publishes this `website/`
folder to GitHub Pages automatically on every push to the branch it
watches. Once enabled in the repo's Settings → Pages (set Source to
"GitHub Actions"), your site will be live at:

```
https://<your-username>.github.io/<repo-name>/
```

No build step required — it just uploads the folder as static files.
