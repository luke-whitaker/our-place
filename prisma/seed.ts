import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

async function main() {
  // Only seed if no communities exist
  const count = await prisma.community.count();
  if (count > 0) {
    console.log("Communities already exist — skipping seed.");
    return;
  }

  // Create system user for official communities
  const systemUser = await prisma.user.create({
    data: {
      username: "ourplace",
      displayName: "Our Place",
      email: "system@ourplace.community",
      phone: "0000000000",
      passwordHash: "$2a$12$placeholder.hash.for.system.user.only",
      bio: "The official Our Place community account.",
      avatarColor: "#6366f1",
      role: "admin",
      isVerified: true,
    },
  });

  const communities = [
    {
      name: "Welcome Center",
      slug: "welcome-center",
      description:
        "New to Our Place? Start here! Introduce yourself, ask questions, and learn how to make the most of your experience.",
      category: "General",
      icon: "\uD83D\uDC4B",
      bannerColor: "#6366f1",
      guidelines: "Be welcoming and supportive. Help new members find their way.",
    },
    {
      name: "Community Support",
      slug: "community-support",
      description:
        "Need help or have feedback? This is the place to connect with the Our Place team and fellow community members.",
      category: "Support & Advice",
      icon: "\uD83E\uDD1D",
      bannerColor: "#8b5cf6",
      guidelines: "Be patient, constructive, and respectful when offering support.",
    },
    {
      name: "Creative Corner",
      slug: "creative-corner",
      description:
        "A space for artists, writers, musicians, and creators of all kinds to share their work, get feedback, and inspire each other.",
      category: "Arts & Culture",
      icon: "\uD83C\uDFA8",
      bannerColor: "#d946ef",
      guidelines:
        "Always give credit. Constructive feedback only. Celebrate creativity in all forms.",
    },
    {
      name: "Tech & Innovation",
      slug: "tech-innovation",
      description:
        "Discuss the latest in technology, share projects, ask for help with coding, and explore the future of innovation together.",
      category: "Technology",
      icon: "\uD83D\uDCA1",
      bannerColor: "#0ea5e9",
      guidelines: "Share knowledge freely. No gatekeeping. Help others learn.",
    },
    {
      name: "Health & Wellness",
      slug: "health-wellness",
      description:
        "Support each other on journeys toward better physical and mental health. Share tips, experiences, and encouragement.",
      category: "Health & Wellness",
      icon: "\uD83C\uDF3F",
      bannerColor: "#10b981",
      guidelines:
        "Be sensitive and supportive. No medical advice — encourage professional help when needed.",
    },
    {
      name: "Book Club",
      slug: "book-club",
      description:
        "For readers and book lovers! Share recommendations, discuss what you're reading, and join monthly reading challenges.",
      category: "Books & Literature",
      icon: "\uD83D\uDCDA",
      bannerColor: "#f59e0b",
      guidelines:
        "Use spoiler warnings. Respect different reading tastes. Share your honest thoughts.",
    },
    {
      name: "Local Events & Meetups",
      slug: "local-events",
      description:
        "Discover and organize local events, meetups, and gatherings. Connect with people in your area.",
      category: "Local & Events",
      icon: "\uD83D\uDCCD",
      bannerColor: "#ef4444",
      guidelines: "Always prioritize safety. Verify event details. Respect privacy.",
    },
    {
      name: "Sustainability Hub",
      slug: "sustainability",
      description:
        "Dedicated to environmental awareness, sustainable living, and making a positive impact on our planet together.",
      category: "Environment",
      icon: "\uD83C\uDF0D",
      bannerColor: "#22c55e",
      guidelines: "Focus on actionable solutions. Be encouraging, not judgmental.",
    },
    {
      name: "Music & Sound",
      slug: "music-sound",
      description:
        "Share music, discuss artists, collaborate on projects, and discover new sounds from around the world.",
      category: "Music",
      icon: "\uD83C\uDFB5",
      bannerColor: "#a855f7",
      guidelines:
        "Respect all genres. Share credit for collaborations. Support independent artists.",
    },
    {
      name: "Food & Cooking",
      slug: "food-cooking",
      description:
        "Exchange recipes, cooking tips, food photography, and culinary adventures. From home cooks to food enthusiasts!",
      category: "Food & Cooking",
      icon: "\uD83C\uDF73",
      bannerColor: "#f97316",
      guidelines: "Share complete recipes when possible. Be inclusive of dietary preferences.",
    },
    {
      name: "Fitness & Sports",
      slug: "fitness-sports",
      description:
        "Whether you're a beginner or an athlete, share workout routines, sports discussions, and fitness goals.",
      category: "Sports & Fitness",
      icon: "\uD83D\uDCAA",
      bannerColor: "#3b82f6",
      guidelines: "Encourage all fitness levels. No body shaming. Celebrate personal progress.",
    },
    {
      name: "Gaming Lounge",
      slug: "gaming-lounge",
      description:
        "A community for gamers of all platforms. Discuss games, find teammates, share clips, and stay updated on gaming news.",
      category: "Gaming",
      icon: "\uD83C\uDFAE",
      bannerColor: "#6366f1",
      guidelines: "No toxicity. Respect all platforms and playstyles. Help new gamers.",
    },
  ];

  for (const c of communities) {
    await prisma.community.create({
      data: {
        ...c,
        creatorId: systemUser.id,
        isOfficial: true,
        memberCount: 0,
      },
    });
  }

  console.log(`Seeded ${communities.length} communities.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
