const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

let db = {
    painel: { nome: "Configurar Nome", banner: "" },
    produtos: [],
    chavePix: "Não definida",
    msgPainelId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Posta o painel de vitrine')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        // Criar cargos se não existirem
        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. COMANDO PARA POSTAR O PAINEL (VITRINE LIMPA)
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setColor("#00ff6a")
                .setImage(db.painel.banner || null);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('config_master').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. CONFIGURAÇÃO (MODAL COM TUDO SEPARADO)
        if (i.isButton() && i.customId === 'config_master') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Apenas o **Dono Sirius** configura!", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_full').setTitle('Configuração Sirius');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n_loja').setLabel('Nome da Loja').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('b_url').setLabel('URL do Banner').setStyle(TextInputStyle.Short).setValue(db.painel.banner || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pix').setLabel('Chave PIX').setStyle(TextInputStyle.Short).setValue(db.chavePix)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_item').setLabel('Nome + Qtd + Emoji').setStyle(TextInputStyle.Short).setPlaceholder("Ex: Conta Full | 5 | 🔥")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_fdd').setLabel('Descrição do Produto (FDD)').setStyle(TextInputStyle.Paragraph))
            );
            return await i.showModal(modal);
        }

        // SALVAR E ATUALIZAR PAINEL
        if (i.isModalSubmit() && i.customId === 'm_full') {
            db.painel.nome = i.fields.getTextInputValue('n_loja');
            db.painel.banner = i.fields.getTextInputValue('b_url');
            db.chavePix = i.fields.getTextInputValue('pix');
            
            const info = i.fields.getTextInputValue('p_item');
            const fdd = i.fields.getTextInputValue('p_fdd');
            if (info) db.produtos.push({ label: info, descricao: fdd });

            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg) {
                const up = new EmbedBuilder().setTitle(db.painel.nome).setImage(db.painel.banner || null).setColor("#00ff6a");
                await msg.edit({ embeds: [up] });
            }
            await i.reply({ content: "✅ Configurações salvas e painel atualizado!", ephemeral: true });
        }

        // 3. VER OPÇÕES (MENU DROPDOWN)
        if (i.isButton() && i.customId === 'ver_opcoes') {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Nenhum produto cadastrado!", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('sel_prod').setPlaceholder('Selecione um produto da lista')
                    .addOptions(db.produtos.map((p, idx) => ({ label: p.label, value: idx.toString() })))
            );
            await i.reply({ content: "Selecione o produto desejado:", components: [menu], ephemeral: true });
        }

        // 4. CRIAR TICKET (SÓ REVISÃO COM DESCRIÇÃO FDD)
        if (i.isStringSelectMenu() && i.customId === 'sel_prod') {
            const prod = db.produtos[parseInt(i.values[0])];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle("🛒 Revisão da Compra")
                .setDescription(`**Produto:** ${prod.label}\n\n**Descrição:**\n${prod.descricao}`)
                .setColor("#5865F2"); // Sem logo/banner no ticket

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ir_pagar').setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('del').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Staff Sirius`, embeds: [embed], components: [row] });
            await i.update({ content: `✅ Ticket criado: ${canal}`, components: [] });
        }

        // 5. PARTE DO PIX (COPIA E COLA)
        if (i.isButton() && i.customId === 'ir_pagar') {
            const pixEmb = new EmbedBuilder()
                .setTitle("Pagamento via PIX")
                .setDescription(`Efetue o pagamento na chave abaixo:\n\n\`${db.chavePix}\`\n\n*Envie o comprovante e aguarde o vendedor.*`)
                .setColor("#00ff6a");

            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm').setLabel('Confirmar Pagamento').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('del').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
            );
            await i.update({ embeds: [pixEmb], components: [btn] });
        }

        // 6. CONFIRMAÇÃO (FICA ABERTO PARA ENTREGA MANUAL)
        if (i.isButton() && i.customId === 'confirm') {
            if (!i.member.roles.cache.has(cargoVend.id) && !i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão!", ephemeral: true });
            
            await i.reply("✅ **Pagamento Confirmado!** Mande o produto/dados para o cliente abaixo. O ticket continua aberto.");
        }

        if (i.isButton() && i.customId === 'del') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } 
    catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
