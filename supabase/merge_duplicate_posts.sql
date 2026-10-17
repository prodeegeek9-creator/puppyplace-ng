-- Unpublish near-duplicate blog posts (several posts answering the same
-- question). Google holds back from crawling a site that publishes many
-- look-alike pages: all of these were "Discovered - currently not indexed"
-- and never crawled (Search Console, Oct 17). The posts become drafts, so
-- nothing is deleted, and worker.js (MERGED_POSTS) 301s each address to
-- the post kept, named in the comment.
-- Run once in Supabase -> SQL Editor, AFTER the new site version is live. Safe to re-run.
-- Undo one: update public.blog_posts set status = 'published' where slug = '...';
update public.blog_posts set status = 'draft'
where status = 'published' and slug in (
  'how-to-treat-low-blood-anemia-in-dogs-nigeria',               -- kept: how-to-treat-low-blood-anemia-in-dogs
  'best-foods-to-increase-blood-in-dogs-naturally',              -- kept: best-blood-building-foods-for-dogs-and-cats-nigeria
  'silent-killer-for-cats-kidney-disease-symptoms-prevention',   -- kept: what-is-the-silent-killer-of-cats-chronic-kidney-disease-symptoms
  'silent-killer-of-cats-kidney-disease-symptoms-prevention',
  'understanding-the-3-3-3-rule-for-adjusting-new-cats',         -- kept: what-is-the-3-3-3-rule-for-cat-acclimation
  'understanding-the-3-3-3-rule-for-cat-adjustment',
  'how-to-make-homemade-kitten-milk-replacer-formula-emergency', -- kept: how-to-make-homemade-kitten-milk-replacer-emergency
  'cost-of-professional-dog-training-nigeria',                   -- kept: cost-of-dog-training-in-nigeria-price-guide
  'cost-to-train-a-dog-in-nigeria-price-guide',
  'cost-to-train-a-dog-nigeria',
  'essential-vitamins-and-supplements-for-senior-dogs',          -- kept: best-vitamins-and-supplements-for-senior-dogs
  'dog-foaming-at-mouth-and-shaking-emergency-causes',           -- kept: dog-foaming-at-the-mouth-causes-emergency-nigeria
  'how-to-tell-if-dog-diarrhea-is-serious-emergency',            -- kept: how-to-know-if-dog-diarrhea-is-serious-emergency-signs
  'safe-home-remedies-for-dog-toothpaste-natural-alternatives',  -- kept: safe-dog-toothpaste-alternatives-natural-home-remedies
  'toxic-ingredients-in-human-toothpaste-for-dogs',              -- kept: what-happens-if-dog-licks-toothpaste-toxicity-guide
  'guide-on-how-to-stimulate-kitten-to-pee-and-poop',            -- kept: how-to-help-newborn-kitten-pee-and-poop-safely
  'how-to-stimulate-a-newborn-kitten-to-poop-at-home',
  '10-most-toxic-foods-for-dogs-and-how-to-avoid-poisoning',     -- kept: complete-guide-to-poisonous-and-toxic-foods-for-dogs
  'most-dangerous-poisonous-foods-for-dogs-guide',
  'best-deworming-medicines-for-dogs-guide',                     -- kept: best-dog-deworming-drug-brands-nigeria
  'best-medications-and-home-care-for-dog-tick-fever',           -- kept: best-medicine-for-tick-fever-in-dogs-nigeria-treatment
  'what-kills-parvovirus-on-surfaces-cleaning-guide',            -- kept: what-kills-parvo-the-fastest-disinfectants-treatment
  'safety-risks-benefits-raw-meat-diet-dogs',                    -- kept: comprehensive-guide-to-safe-raw-meats-for-dogs-nigeria
  'what-raw-meat-can-dogs-not-eat-safe-feeding-guide',
  'why-dogs-shouldnt-eat-raw-meat-risks-nigeria',
  'how-to-train-dog-for-loose-leash-walking',                    -- kept: how-to-teach-dog-not-to-pull-on-leash-guide
  'german-shepherd-normal-price-and-ownership-costs',            -- kept: cost-of-german-shepherd-puppy-nigeria-naira-price
  'cost-of-veterinary-services-and-clinics-nigeria',             -- kept: vet-visit-cost-nigeria-price-guide
  'dog-flea-medicine-on-cat-risks',                              -- kept: what-happens-if-you-put-dog-flea-medicine-on-a-cat
  'treatment-and-cure-for-dog-pooping-blood',                    -- kept: what-can-i-give-my-dog-to-stop-pooping-blood-treatment-guide
  'can-dog-recover-from-pancreatitis-treatment-recovery-guide',  -- kept: how-to-heal-pancreatitis-in-dogs-fast-recovery-guide
  'factors-that-make-dog-high-risk-for-anesthesia',              -- kept: how-risky-is-anesthesia-for-dogs-safety-guide
  'what-to-do-if-your-puppy-gets-worms',                         -- kept: how-to-get-rid-of-dog-worms-in-puppies-nigeria
  'how-to-kill-ticks-on-dogs-immediately-safe-nigeria-guide',    -- kept: how-to-get-rid-of-ticks-on-dogs-in-nigeria-treatment-prevention
  'signs-your-pet-is-suffering-emergency-guide',                 -- kept: signs-your-pet-needs-immediate-vet-attention
  'how-to-safely-flush-poison-out-of-a-cat-emergency-guide'      -- kept: how-to-treat-poisoned-cat-at-home-emergency-guide
);
