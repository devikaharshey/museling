# 🎵 Museling

> A music discovery and social platform designed to help people discover concerts, connect through shared musical interests, and turn music discovery into real-world experiences.


## 🎧 Overview

Museling is a music-focused social platform built around concert discovery and community.

The platform helps users discover upcoming concerts, explore events by location, find people with shared musical interests, join groups, manage invitations, and participate in music-focused communities.

Rather than treating concerts as simple event listings, Museling combines event discovery with social functionality so that discovering music can also become a way of discovering people and communities.


## ✨ Core Features

### 🎤 Concert Discovery

Users can browse upcoming concerts and music events with information including:

- 🎵 Concert name
- 📍 Venue
- 🌍 Location
- 🏙️ City
- 📅 Date and time
- 🎶 Genre
- 💷 Ticket price
- 💰 Maximum ticket price
- 📝 Description
- 🎟️ Booking URL
- 🗺️ Geographic coordinates

Concert data is stored in Supabase and loaded dynamically by the application.


### 🗺️ Interactive Concert Map

Museling provides an interactive map for discovering concerts geographically.

Concert records contain latitude and longitude coordinates, allowing events to be displayed directly on the map.

The map uses the Google Maps browser integration for visualization.


### 🔎 Location Search

Users can search for locations from the Discover experience.

The location search converts a user-entered place into geographic coordinates, which can then be used to find concerts around that location.

Museling uses OpenStreetMap Nominatim for location geocoding.

This keeps location search independent from the map-rendering provider.


### 🎯 Search and Filtering

The Discover experience supports location-based searching and concert filtering.

Users can search for locations such as:

- 📍 Oxford
- 📍 London
- 📍 India
- 🌍 Other supported locations

The application converts the searched location into coordinates and uses those coordinates for location-based discovery.


### 👤 User Profiles

Users can create and manage profiles containing information such as:

- First name
- Last name
- Age
- WhatsApp number
- Country
- Post code / location
- Music preferences


### 🎶 Music Preferences

During onboarding, users select the music genres they enjoy.

These preferences are stored in their profile and can be used to personalize the Museling experience.


### 🤝 Social Discovery

Museling is designed to help users discover people through shared musical interests.

The application includes functionality for:

- 👤 User profiles
- ❤️ Following users
- 👥 Groups
- 🤝 Group membership
- ✉️ Invitations
- 🫂 Meetups
- 🔔 Notifications
- 💬 User interactions
- 🛡️ Safety and reporting


### 👥 Groups

Users can participate in music-focused groups and communities.

Groups provide a way for users with shared interests to interact beyond individual concert discovery.


### ✉️ Invitations

Museling includes invitation functionality for connecting users and facilitating participation in groups and activities.


### 🫂 Meetups

The application contains functionality for organizing and participating in music-related meetups.


### 🔔 Notifications

Users can receive notifications related to relevant activity and interactions within the platform.


### 🔐 Authentication

Museling uses Supabase Auth for account authentication.

Authentication functionality includes:

- 📧 Email/password sign-up
- 🔑 Email/password sign-in
- ✉️ Email verification
- 🔄 Password recovery
- 💾 Persistent sessions
- 🔵 Google authentication

Authenticated routes are protected through the application's authentication layer.


### 💳 Payments and Billing

Museling contains subscription and payment functionality.

The project integrates:

- 💳 Stripe
- 💰 Razorpay

Payment-related operations are handled through appropriate client-side and server-side components.


## 🛠️ Technology Stack

### 💻 Frontend

- ⚛️ React
- 🔷 TypeScript
- 🧭 TanStack Router
- 🚀 TanStack Start
- ⚡ Vite
- 🎨 Tailwind CSS
- 🧩 shadcn/ui
- 🎞️ Motion
- ✨ Lucide Icons


### 🗄️ Backend and Database

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Row Level Security
- Supabase migrations


### 🌐 External Services

- 🗺️ Google Maps
- 🌍 OpenStreetMap Nominatim
- 💳 Stripe
- 💰 Razorpay
- 🔵 Google OAuth


### ☁️ Deployment

- ▲ Vercel


### 🔧 Development Tools

- 🥟 Bun
- 📦 npm
- 🔍 ESLint
- ✨ Prettier
- 🌿 Git
- 🐙 GitHub


## 🏗️ Architecture

Museling follows a modern full-stack web architecture.

                         ┌─────────────────────┐
                         │        👤 User       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      ⚛️ React UI     │
                         │   TanStack Router   │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
          ┌─────────────────────┐        ┌─────────────────────┐
          │   ⚙️ Server Functions │        │   🌐 External APIs  │
          │  TanStack Start     │        │ Maps / Payments     │
          └──────────┬──────────┘        └─────────────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │      🗄️ Supabase    │
          │                     │
          │ PostgreSQL          │
          │ Authentication      │
          │ Row Level Security  │
          │ Database Services   │
          └─────────────────────┘


## 🧭 Application Flow

A typical Museling user journey looks like:

🏠 Landing Page
     │
     ▼
🔐 Create Account / Sign In
     │
     ▼
📧 Email Verification
     │
     ▼
👤 Profile Setup
     │
     ├── Personal Details
     │
     └── 🎶 Music Preferences
     │
     ▼
🎵 Discover
     │
     ├── 🎤 Browse Concerts
     ├── 🔎 Search Location
     ├── 🗺️ Explore Map
     └── 🎟️ View Concert Details
     │
     ▼
🤝 Social Discovery
     │
     ├── 👤 Find People
     ├── 👥 Groups
     ├── ✉️ Invitations
     └── 🫂 Meetups


## 🗄️ Database

Museling uses PostgreSQL through Supabase.

The database contains application data for areas including:

- 👤 User profiles
- 🎤 Concerts
- 👥 Groups
- ✉️ Invitations
- ❤️ Follows
- 🫂 Meetups
- 🔔 Notifications
- 💳 Payments
- 🌟 Founding membership
- 🛡️ User safety and reporting


### 🎤 Concerts Table

The `concerts` table stores event information including:

- `id`
- `name`
- `venue`
- `location`
- `concert_at`
- `genre`
- `ticket_price_pence`
- `capacity`
- `description`
- `meeting_details`
- `created_at`
- `updated_at`
- `lat`
- `lng`
- `booking_url`
- `city`
- `source`
- `external_id`
- `ticket_price_max_pence`
- `currency`

Concert records include geographic coordinates so they can be displayed directly on the interactive map.


## 🔐 Authentication Architecture

Authentication is handled through Supabase Auth.

The application maintains persistent authentication sessions and automatically refreshes authentication tokens.

Protected application routes verify the current Supabase user before allowing access.

The authentication flow is:

📝 Create Account
      │
      ▼
📧 Email Verification
      │
      ▼
👤 Profile Setup
      │
      ▼
🎶 Genre Preferences
      │
      ▼
🎵 Discover

Google authentication is also available as an alternative authentication method.


## 📍 Location Architecture

Museling separates map visualization from location geocoding.


### 🗺️ Map Visualization

The interactive map uses the Google Maps browser integration.

Concerts already contain latitude and longitude values in the database, so the application can display them directly without geocoding every concert.

🗄️ Supabase concerts
       │
       ├── lat
       └── lng
             │
             ▼
       🗺️ Google Maps
             │
             ▼
      🎤 Concert markers


### 🌍 Location Geocoding

When a user enters a location into the search interface, Museling uses OpenStreetMap Nominatim to convert the location into coordinates.

👤 User enters location
        │
        ▼
🌍 Nominatim Geocoding
        │
        ▼
📍 Latitude + Longitude
        │
        ▼
🎤 Concert discovery

This allows the application to keep location search independent from the map visualization service.


## 💳 Payment Architecture

Museling includes payment infrastructure for subscription and billing functionality.

The project integrates both Stripe and Razorpay.

Payment functionality is separated between client-side interfaces and server-side operations.

Sensitive payment credentials are stored as environment variables and are not committed to the repository.


## 📁 Project Structure

museling/
│
├── 📁 public/
│
├── 📁 scripts/
│   ├── reseed.mjs
│   └── scrape-london.mjs
│
├── 📁 src/
│   │
│   ├── 📁 assets/
│   │
│   ├── 📁 components/
│   │   ├── 📁 ui/
│   │   ├── MuselingLogo.tsx
│   │   ├── PaymentTestModeBanner.tsx
│   │   └── TabBar.tsx
│   │
│   ├── 📁 hooks/
│   │   ├── use-auth.ts
│   │   ├── use-geolocation.ts
│   │   └── use-mobile.tsx
│   │
│   ├── 📁 integrations/
│   │   └── supabase/
│   │
│   ├── 📁 lib/
│   │   ├── badges.ts
│   │   ├── geocode.functions.ts
│   │   ├── museling.ts
│   │   ├── remember-me.ts
│   │   ├── stripe.ts
│   │   ├── stripe.server.ts
│   │   ├── razorpay.server.ts
│   │   └── utils.ts
│   │
│   ├── 📁 routes/
│   │   ├── _authenticated/
│   │   ├── api/
│   │   ├── auth.tsx
│   │   ├── signin.tsx
│   │   ├── signup.tsx
│   │   └── index.tsx
│   │
│   ├── 📁 utils/
│   │   ├── admin.functions.ts
│   │   ├── concerts.functions.ts
│   │   ├── follows.functions.ts
│   │   ├── founding.functions.ts
│   │   ├── intents.functions.ts
│   │   ├── invites.functions.ts
│   │   ├── meetups.functions.ts
│   │   ├── notifications.functions.ts
│   │   ├── payments.functions.ts
│   │   ├── razorpay.functions.ts
│   │   └── safety.functions.ts
│   │
│   ├── router.tsx
│   ├── server.ts
│   ├── start.ts
│   └── styles.css
│
├── 📁 supabase/
│   ├── migrations/
│   └── config.toml
│
├── package.json
├── bun.lock
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
└── README.md


## 🔑 Environment Variables

Create a local environment file containing the credentials required by the application.

Typical client-side configuration includes:

VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_GOOGLE_MAPS_BROWSER_KEY=

Payment functionality requires the appropriate Stripe and Razorpay credentials.

Server-side credentials should be configured through the deployment environment rather than committed to the repository.

⚠️ Never commit `.env`, `.env.local`, or any other file containing private credentials or secrets.


## 💻 Local Development

### 1️⃣ Clone the Repository

git clone https://github.com/devikaharshey/museling.git

cd museling


### 2️⃣ Install Dependencies

Using npm:

npm install

Or using Bun:

bun install


### 3️⃣ Configure Environment Variables

Create the appropriate local environment file and provide the required Supabase, Maps, and payment configuration.


### 4️⃣ Start the Development Server

Using npm:

npm run dev

Or using Bun:

bun run dev


## 🗃️ Database Migrations

Supabase database migrations are stored in:

supabase/migrations/

Each migration represents a database schema or database behavior change.

When modifying the database:

1. Create or update the appropriate migration.
2. Test the change against the development database.
3. Verify the affected application functionality.
4. Apply the migration to the production database.


## 📊 Data Management

The repository contains scripts for application data management.


### 🔄 Reseeding

scripts/reseed.mjs

The reseed script is used for rebuilding or reseeding application data.


### 🎤 Concert Data

scripts/scrape-london.mjs

The project also contains a script for collecting concert/event data related to London.

Concert datasets can be imported into the Supabase `concerts` table when required.


## 🚀 Deployment

Museling is deployed using Vercel.

The production application is connected to the GitHub repository.

The deployment flow is:

💻 Local Development
       │
       ▼
🌿 Git
       │
       ▼
🐙 GitHub
       │
       ▼
▲ Vercel
       │
       ▼
🌍 Production

Production environment variables are configured through Vercel.


## 🛡️ Security

Museling uses several layers of application security:

- 🔐 Supabase authentication
- 🛡️ Protected authenticated routes
- 🔒 Supabase Row Level Security
- ⚙️ Server-side handling of sensitive operations
- 🔑 Environment variables for secrets
- 🔐 Separation of browser and server credentials
- 💳 Server-side payment operations
- 🛡️ User safety and reporting functionality

Private API keys and credentials must never be committed to the repository.


## 🎨 Design Philosophy

Museling is built around the idea that music discovery can be a social experience.

Rather than treating concerts as simple event listings, Museling connects:

🎵 Music
  ↓
🎤 Concerts
  ↓
👥 People
  ↓
🤝 Communities
  ↓
🌍 Real-world experiences

The goal is to make discovering music a pathway to discovering people and building meaningful connections around shared musical interests.


## 📌 Current Product Scope

The current Museling MVP includes:

- 📝 User registration
- 📧 Email verification
- 🔐 User authentication
- 🔵 Google authentication
- 👤 Profile onboarding
- 🎶 Music genre preferences
- 🎤 Concert discovery
- 🔎 Location search
- 🗺️ Interactive concert map
- 🎟️ Concert details
- 🔗 Booking links
- 👥 User profiles
- ❤️ Social interactions
- 👥 Groups
- ✉️ Invitations
- 🫂 Meetups
- 🔔 Notifications
- 🛡️ Safety/reporting functionality
- 💳 Billing and payment infrastructure
- 🚀 Production deployment


## 🌍 Production

### 🚀 Live Application

https://museling.vercel.app

### 🐙 GitHub Repository

https://github.com/devikaharshey/museling


## 📄 License

A project license can be added here when the licensing terms for Museling are finalized.