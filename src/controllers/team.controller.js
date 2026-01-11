const TournamentTeam = require('../models/TournamentTeam');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const User = require('../models/User');

const teamController = {
  // Create permanent team
  createTeam: async (req, res) => {
    try {
      const { name, tag, bio, logo } = req.body;

      // Check if team name already exists
      const existingTeam = await Team.findOne({ 
        $or: [{ name }, { tag }] 
      });

      if (existingTeam) {
        return res.status(400).json({
          success: false,
          message: existingTeam.name === name 
            ? 'Team name already taken' 
            : 'Team tag already taken'
        });
      }

      // Create team
      const team = new Team({
        name,
        tag,
        bio,
        logo,
        owner: req.user._id,
        captain: req.user._id,
        members: [{
          userId: req.user._id,
          role: 'owner',
          permissions: ['manage_team', 'manage_members', 'manage_tournaments', 'manage_finances']
        }],
        roster: [{
          userId: req.user._id,
          inGameName: req.user.inGameName,
          bgmiId: req.user.bgmiId,
          position: 'flex'
        }],
        createdBy: req.user._id
      });

      await team.save();

      res.status(201).json({
        success: true,
        message: 'Team created successfully',
        data: { team }
      });

    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create team'
      });
    }
  },

  // Get team details
  getTeam: async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = await Team.findById(teamId)
        .populate('owner', 'name email profileImage')
        .populate('captain', 'name inGameName profileImage')
        .populate('members.userId', 'name email inGameName profileImage')
        .populate('roster.userId', 'name inGameName profileImage')
        .lean();

      if (!team || team.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      res.json({
        success: true,
        data: { team }
      });

    } catch (error) {
      console.error('Get team error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch team details'
      });
    }
  },

  // Update team
  updateTeam: async (req, res) => {
    try {
      const { teamId } = req.params;
      const updates = req.body;

      // Check if user is team owner/captain
      const team = await Team.findById(teamId);
      
      if (!team || team.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      const isOwner = team.owner.toString() === req.user._id.toString();
      const isCaptain = team.captain.toString() === req.user._id.toString();
      
      if (!isOwner && !isCaptain) {
        return res.status(403).json({
          success: false,
          message: 'Only team owner or captain can update team details'
        });
      }

      // Update team
      const updatedTeam = await Team.findByIdAndUpdate(
        teamId,
        { $set: updates, updatedBy: req.user._id },
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Team updated successfully',
        data: { team: updatedTeam }
      });

    } catch (error) {
      console.error('Update team error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update team'
      });
    }
  },

  // Add member to permanent team
  addMember: async (req, res) => {
    try {
      const { teamId } = req.params;
      const { userId, role, position } = req.body;

      const team = await Team.findById(teamId);
      
      if (!team || team.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if user is authorized
      const isAuthorized = team.members.some(member => 
        member.userId.toString() === req.user._id.toString() &&
        member.permissions.includes('manage_members')
      );

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to add members'
        });
      }

      // Check if user is already a member
      const isAlreadyMember = team.members.some(member => 
        member.userId.toString() === userId
      );

      if (isAlreadyMember) {
        return res.status(400).json({
          success: false,
          message: 'User is already a team member'
        });
      }

      // Get user details
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Add to members
      team.members.push({
        userId,
        role: role || 'player',
        permissions: role === 'player' ? [] : ['manage_tournaments']
      });

      // Add to roster if player role
      if (role === 'player') {
        team.roster.push({
          userId,
          inGameName: user.inGameName,
          bgmiId: user.bgmiId,
          position: position || 'flex',
          joinDate: new Date(),
          isActive: true
        });
      }

      await team.save();

      res.json({
        success: true,
        message: 'Member added successfully',
        data: { team }
      });

    } catch (error) {
      console.error('Add member error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add member'
      });
    }
  },

  // Remove member from permanent team
  removeMember: async (req, res) => {
    try {
      const { teamId, memberId } = req.params;

      const team = await Team.findById(teamId);
      
      if (!team || team.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if user is authorized
      const isAuthorized = team.members.some(member => 
        member.userId.toString() === req.user._id.toString() &&
        member.permissions.includes('manage_members')
      );

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to remove members'
        });
      }

      // Check if trying to remove owner
      if (team.owner.toString() === memberId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot remove team owner'
        });
      }

      // Remove from members
      team.members = team.members.filter(member => 
        member.userId.toString() !== memberId
      );

      // Remove from roster
      team.roster = team.roster.filter(player => 
        player.userId.toString() !== memberId
      );

      // If removing captain, assign new captain
      if (team.captain.toString() === memberId && team.members.length > 0) {
        team.captain = team.members[0].userId;
      }

      await team.save();

      res.json({
        success: true,
        message: 'Member removed successfully',
        data: { team }
      });

    } catch (error) {
      console.error('Remove member error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove member'
      });
    }
  },

  // Join tournament team using join code
  joinTournamentTeam: async (req, res) => {
    try {
      const { joinCode } = req.body;

      // Find tournament team with valid join code
      const tournamentTeam = await TournamentTeam.findOne({
        joinCode,
        joinCodeExpires: { $gt: new Date() },
        registrationStatus: { $in: ['draft', 'pending'] }
      }).populate('tournamentId');

      if (!tournamentTeam) {
        return res.status(404).json({
          success: false,
          message: 'Invalid or expired join code'
        });
      }

      // Check if team is full
      if (tournamentTeam.isTeamFull()) {
        return res.status(400).json({
          success: false,
          message: 'Team is already full'
        });
      }

      // Check if user is already in team
      const isAlreadyMember = tournamentTeam.members.some(member => 
        member.userId && member.userId.toString() === req.user._id.toString()
      );

      if (isAlreadyMember) {
        return res.status(400).json({
          success: false,
          message: 'You are already in this team'
        });
      }

      // Check if user is the captain
      if (tournamentTeam.captain.userId.toString() === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'You are the captain of this team'
        });
      }

      // Check BGMI ID uniqueness
      const allBGMIIds = [
        tournamentTeam.captain.bgmiId,
        ...tournamentTeam.members.map(m => m.bgmiId)
      ];

      if (allBGMIIds.includes(req.user.bgmiId)) {
        return res.status(400).json({
          success: false,
          message: 'BGMI ID already exists in team'
        });
      }

      // Add user to team
      tournamentTeam.members.push({
        userId: req.user._id,
        bgmiId: req.user.bgmiId,
        inGameName: req.user.inGameName,
        phone: req.user.phone,
        position: 'flex',
        status: 'pending',
        joinedAt: new Date()
      });

      await tournamentTeam.save();

      // Add user to tournament registration
      const tournament = await Tournament.findById(tournamentTeam.tournamentId);
      
      if (tournament) {
        tournament.registeredPlayers.push({
          userId: req.user._id,
          registrationType: 'team_member',
          teamId: tournamentTeam._id,
          teamName: tournamentTeam.teamName,
          isCaptain: false,
          bgmiId: req.user.bgmiId,
          inGameName: req.user.inGameName,
          registeredAt: new Date()
        });

        tournament.registrationCount = tournament.registeredPlayers.length;
        await tournament.save();
      }

      res.json({
        success: true,
        message: 'Joined team successfully. Waiting for captain approval.',
        data: {
          team: {
            _id: tournamentTeam._id,
            teamName: tournamentTeam.teamName,
            tournament: tournamentTeam.tournamentId.name
          }
        }
      });

    } catch (error) {
      console.error('Join team error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to join team'
      });
    }
  },

  // Get tournament team details
  getTournamentTeam: async (req, res) => {
    try {
      const { teamId } = req.params;

      const tournamentTeam = await TournamentTeam.findById(teamId)
        .populate('tournamentId', 'name startDate type')
        .populate('captain.userId', 'name email inGameName profileImage')
        .populate('members.userId', 'name email inGameName profileImage')
        .lean();

      if (!tournamentTeam) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if user is part of this team
      const isTeamMember = 
        tournamentTeam.captain.userId._id.toString() === req.user._id.toString() ||
        tournamentTeam.members.some(member => 
          member.userId && member.userId._id.toString() === req.user._id.toString()
        );

      if (!isTeamMember && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view this team'
        });
      }

      res.json({
        success: true,
        data: { team: tournamentTeam }
      });

    } catch (error) {
      console.error('Get tournament team error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch team details'
      });
    }
  },

  // Confirm team member (Captain only)
  confirmTeamMember: async (req, res) => {
    try {
      const { teamId, memberId } = req.params;

      const tournamentTeam = await TournamentTeam.findById(teamId);
      
      if (!tournamentTeam) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if user is captain
      if (tournamentTeam.captain.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only team captain can confirm members'
        });
      }

      // Find and confirm member
      const memberIndex = tournamentTeam.members.findIndex(member => 
        member.userId && member.userId.toString() === memberId
      );

      if (memberIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Member not found'
        });
      }

      tournamentTeam.members[memberIndex].status = 'confirmed';
      tournamentTeam.members[memberIndex].isVerified = true;
      tournamentTeam.members[memberIndex].verifiedAt = new Date();
      
      await tournamentTeam.save();

      res.json({
        success: true,
        message: 'Team member confirmed successfully',
        data: { team: tournamentTeam }
      });

    } catch (error) {
      console.error('Confirm member error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to confirm team member'
      });
    }
  },

  // Get user's teams
  getMyTeams: async (req, res) => {
    try {
      const { type = 'permanent', page = 1, limit = 10 } = req.query;

      if (type === 'permanent') {
        // Get permanent teams where user is a member
        const query = {
          'members.userId': req.user._id,
          isDeleted: false
        };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const teams = await Team.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('captain', 'name inGameName')
          .lean();

        const total = await Team.countDocuments(query);

        res.json({
          success: true,
          data: {
            teams,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total,
              pages: Math.ceil(total / parseInt(limit))
            }
          }
        });
      } else {
        // Get tournament teams
        const query = {
          $or: [
            { 'captain.userId': req.user._id },
            { 'members.userId': req.user._id }
          ]
        };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const tournamentTeams = await TournamentTeam.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('tournamentId', 'name startDate')
          .lean();

        const total = await TournamentTeam.countDocuments(query);

        res.json({
          success: true,
          data: {
            teams: tournamentTeams,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total,
              pages: Math.ceil(total / parseInt(limit))
            }
          }
        });
      }

    } catch (error) {
      console.error('Get my teams error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch teams'
      });
    }
  },

  // Search teams
  searchTeams: async (req, res) => {
    try {
      const { query, type = 'permanent', page = 1, limit = 10 } = req.query;

      if (type === 'permanent') {
        const searchQuery = {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { tag: { $regex: query, $options: 'i' } }
          ],
          status: 'active',
          isDeleted: false
        };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const teams = await Team.find(searchQuery)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('captain', 'name inGameName')
          .lean();

        const total = await Team.countDocuments(searchQuery);

        res.json({
          success: true,
          data: {
            teams,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total,
              pages: Math.ceil(total / parseInt(limit))
            }
          }
        });
      } else {
        // Search tournament teams (for specific tournament)
        res.json({
          success: true,
          data: { teams: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }
        });
      }

    } catch (error) {
      console.error('Search teams error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search teams'
      });
    }
  }
};

module.exports = teamController;