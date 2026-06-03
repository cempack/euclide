To delete the old/legacy repo (cempack/euclide-legacy) which contains history with the name:

1. Run this command in your terminal:
   gh auth refresh -h github.com -s delete_repo

2. Follow the link, enter the device code it gives you (example from recent: DC02-6C30 or whatever it shows), authorize.

3. Then run:
   gh repo delete cempack/euclide-legacy --yes

The current repo cempack/euclide is the fresh new one with:
- No "Madrias" in public README / descriptions (only inside the app code where intended)
- Clean single initial commit history
- Full rename to Euclide complete (including the lib name fix)

The app "npm run app" now compiles and runs successfully.
