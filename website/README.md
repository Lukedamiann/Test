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

## Sections

The site is built around a finance/business background rather than a
dev-portfolio layout:

1. **Hero** — name, tagline, and one-line intro.
2. **About** — bio text and quick facts (location, focus, email).
3. **Education** — a `.entry-card` for your school, degree, GPA, honors.
4. **Experience** — one `.entry-card` per job, each with a title,
   date range, and bullet list of what you did there.
5. **Leadership & Involvement** — same `.entry-card` pattern for clubs,
   orgs, and anything you led or organized outside class.
6. **Skills & Interests** — three `.pill-row` groups (core skills,
   currently learning, interests).
7. **Contact** — a demo form (see below) plus real `mailto:` links in
   About facts and the footer.

## Customizing

1. **Add/update an Experience or Leadership entry** — copy an existing
   `<article class="card entry-card reveal">` block and edit the title,
   date, role line, and bullet points.
2. **Skills** — edit the `.pill` lists per group in the Skills section.
3. **Contact** — update the `mailto:` links (About facts + footer) if
   your email changes, and add your real LinkedIn URL in the footer
   (marked `EDIT ME`).
4. **Rotating hero words** — edit the `roles` array at the top of
   `js/main.js`.
5. **Favicon** — `assets/favicon.svg` is a placeholder "L" mark; swap it
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
