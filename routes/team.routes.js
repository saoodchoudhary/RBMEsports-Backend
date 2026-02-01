const express = require('express');
const router = express.Router();
const TournamentTeam = require('../models/TournamentTeam');
const { protect } = require('../middleware/auth.middleware');

// @desc    Get team details
// @route   GET /api/teams/:id
// @access  Public
router.get('/:id', async (req, res, next) => {
  try {
    const team = await TournamentTeam.findById(req.params.id)
      .populate('tournamentId', 'title tournamentType')
      .populate('captain.userId', 'name email')
      .populate('paymentId');
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: team
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get my teams
// @route   GET /api/teams/my-teams
// @access  Private
router.get('/my/teams', protect, async (req, res, next) => {
  try {
    const teams = await TournamentTeam.find({
      'captain.userId': req.user.id
    })
      .populate('tournamentId', 'title tournamentType tournamentStartDate status')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update team
// @route   PUT /api/teams/:id
// @access  Private
router.put('/:id', protect, async (req, res, next) => {
  try {
    const team = await TournamentTeam.findById(req.params.id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }
    
    // Check if user is captain
    if (team.captain.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only team captain can update team'
      });
    }
    
    const { teamName, teamLogo, members } = req.body;
    
    if (teamName) team.teamName = teamName;
    if (teamLogo) team.teamLogo = teamLogo;
    if (members) team.members = members;
    
    await team.save();
    
    res.status(200).json({
      success: true,
      message: 'Team updated successfully',
      data: team
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;